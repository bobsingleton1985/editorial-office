"""One application-owned OpenRouter password in macOS Keychain; no CLI secrets."""
import ctypes as C
import sys
import threading


class CredentialError(RuntimeError):
    """Only constant, non-secret error codes may cross the HTTP boundary."""


class MacKeychain:
    SERVICE = 'CinemaStudio.PhonePrivacy'
    ACCOUNT = 'local-history-aes256'
    _lock = threading.RLock()

    def __init__(self, service=SERVICE, account=ACCOUNT):
        if sys.platform != 'darwin':
            raise CredentialError('keychain_unavailable')
        self.service, self.account = service.encode(), account.encode()
        try:
            self.sec = C.CDLL('/System/Library/Frameworks/Security.framework/Security')
            self.cf = C.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
        except OSError:
            raise CredentialError('keychain_unavailable') from None
        ptr, uint = C.c_void_p, C.c_uint32
        signatures = {
            'SecKeychainFindGenericPassword': [ptr, uint, C.c_char_p, uint, C.c_char_p, C.POINTER(uint), C.POINTER(ptr), C.POINTER(ptr)],
            'SecKeychainAddGenericPassword': [ptr, uint, C.c_char_p, uint, C.c_char_p, uint, ptr, C.POINTER(ptr)],
            'SecKeychainItemModifyAttributesAndData': [ptr, ptr, uint, ptr],
            'SecKeychainItemDelete': [ptr],
            'SecKeychainItemFreeContent': [ptr, ptr],
            'SecKeychainSetUserInteractionAllowed': [C.c_ubyte],
            'SecKeychainGetUserInteractionAllowed': [C.POINTER(C.c_ubyte)],
        }
        for name, args in signatures.items():
            fn = getattr(self.sec, name)
            fn.argtypes, fn.restype = args, C.c_int32
        self.cf.CFRelease.argtypes, self.cf.CFRelease.restype = [ptr], None

    @staticmethod
    def _check(status):
        if status:
            raise CredentialError('keychain_locked_or_denied' if status in (-25308, -25293, -128) else 'keychain_operation_failed')

    def _find(self, read=False):
        size, data, item = C.c_uint32(), C.c_void_p(), C.c_void_p()
        status = self.sec.SecKeychainFindGenericPassword(
            None, len(self.service), self.service, len(self.account), self.account,
            C.byref(size) if read else None, C.byref(data) if read else None, C.byref(item))
        try:
            if status == -25300:
                return None, None
            self._check(status)
            try:
                value = C.string_at(data, size.value).decode('utf-8') if read else None
            except UnicodeError:
                raise CredentialError('keychain_operation_failed') from None
            return value, item
        except Exception:
            if item: self.cf.CFRelease(item)
            raise
        finally:
            if data: self.sec.SecKeychainItemFreeContent(None, data)

    def load(self):
        with self._lock:
            value, item = self._find(read=True)
            if item: self.cf.CFRelease(item)
            return value

    def save(self, value):
        if not isinstance(value, str) or not value or len(value) > 1000 or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value):
            raise CredentialError('invalid_config')
        raw = value.encode('utf-8')
        with self._lock:
            _, item = self._find()
            try:
                if item:
                    self._check(self.sec.SecKeychainItemModifyAttributesAndData(item, None, len(raw), raw))
                else:
                    self._check(self.sec.SecKeychainAddGenericPassword(None, len(self.service), self.service, len(self.account), self.account, len(raw), raw, None))
            finally:
                if item: self.cf.CFRelease(item)

    def delete(self):
        with self._lock:
            _, item = self._find()
            if item:
                try: self._check(self.sec.SecKeychainItemDelete(item))
                finally: self.cf.CFRelease(item)

    def load_unattended(self):
        """Don't hang server startup waiting for a locked Keychain dialog."""
        with self._lock:
            old = C.c_ubyte()
            self._check(self.sec.SecKeychainGetUserInteractionAllowed(C.byref(old)))
            self._check(self.sec.SecKeychainSetUserInteractionAllowed(False))
            try: return self.load()
            finally: self.sec.SecKeychainSetUserInteractionAllowed(old)

if __name__ == '__main__':
    import secrets
    try:
        store = MacKeychain()
        value = store.load_unattended()
        if value is None and '--ensure' in sys.argv:
            store.save(secrets.token_hex(32))
            value = store.load_unattended()
        if not value or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
            raise CredentialError('privacy_key_unavailable')
        if '--ensure' in sys.argv:
            print('privacy_key_ready')
        else:
            sys.stdout.write(value)
    except Exception:
        print('privacy_key_unavailable', file=sys.stderr)
        sys.exit(1)
