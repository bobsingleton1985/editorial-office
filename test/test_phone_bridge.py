import importlib.util
from pathlib import Path
import unittest
import json
import os
import shutil
import tempfile
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('bridge',Path(__file__).resolve().parents[1]/'tg-calls.py')
bridge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class PhoneTests(unittest.TestCase):
    def test_addresses(self):
        for prefix,target in [('Позвони репортёру','reporter'),('Арчи, позвони редактору','newspaper_editor'),('Колумнисту','columnist'),('Позвони героине','heroine')]:
            self.assertEqual(bridge.parse_call(prefix+': Текст: $5\nЕщё строка'),(target,'Текст: $5\nЕщё строка'))
        for text in ['Позвони никому: Текст','Позвони репортёру','Редактору: ']:
            with self.assertRaises(bridge.InvalidCall): bridge.parse_call(text)
        for text in ['Он сказал: позвони репортёру','«Позвони репортёру: текст»','Обычное сообщение']:
            self.assertIsNone(bridge.parse_call(text))

    def update(self,text,**post):
        return {'update_id':3,'channel_post':{'chat':{'id':-1},'message_id':8,'date':110,'text':text,**post}}

    def process(self,update):
        events=[]
        result=bridge.process_update(update,'-1',100,enqueue_bonus=lambda *a:events.append(('bonus',a)),
                enqueue_call=lambda *a:events.append(('call',a)),save_offset=lambda n:events.append(('offset',n)),report=lambda *a:events.append(('report',a)))
        if result=='call': self.assertLess(next(i for i,e in enumerate(events) if e[0]=='call'),next(i for i,e in enumerate(events) if e[0]=='offset'))
        return result,events

    def test_routing_and_bonus_regression(self):
        _,events=self.process(self.update('Позвони репортёру: премия всем по 5 долларов'))
        self.assertIn(('call',('премия всем по 5 долларов','reporter',bridge.call_id('-1',8,110))),events)
        self.assertFalse(any(e[0]=='bonus' for e in events))
        _,events=self.process(self.update('Обычный текст'));self.assertIn(('call',('Обычный текст',None,bridge.call_id('-1',8,110))),events)
        result,events=self.process(self.update('премия всем по 5 долларов'));self.assertEqual(result,'call');self.assertFalse(any(e[0]=='bonus' for e in events));self.assertIn(('call',('премия всем по 5 долларов',None,bridge.call_id('-1',8,110))),events)
        result,events=self.process(self.update('Позвони героине: Текст'));self.assertEqual(result,'call');self.assertIn(('call',('Текст','heroine',bridge.call_id('-1',8,110))),events)

    def test_quotes_forwards_and_other_channel_do_not_select_recipient(self):
        for post in [{'forward_origin':{'type':'channel'}},{'date':99},{'entities':[{'type':'blockquote'}]}]:
            _,events=self.process(self.update('Позвони репортёру: Текст',**post));self.assertIn(('call',('Позвони репортёру: Текст',None,bridge.call_id('-1',8,post.get('date',110)),None,False)),events)
        _,events=self.process(self.update('Позвони репортёру: Текст',chat={'id':-2}));self.assertEqual(events,[('offset',4)])

    def test_migration_retry_of_existing_bonus_cannot_become_new_natural_payment(self):
        events=[];update=self.update('премия всем по 5 долларов')
        result=bridge.process_update(update,'-1',100,enqueue_bonus=lambda *a:events.append('bonus'),enqueue_call=lambda *a:events.append('call'),save_offset=lambda n:events.append(n),report=lambda *a:None,legacy_bonus_received=lambda id:id==bridge.bonus_id('-1',8))
        self.assertEqual(result,'legacy_bonus_received');self.assertEqual(events,[4])

    def test_queue_failure_keeps_update_unacknowledged(self):
        offsets=[]
        def failed(*args): raise OSError('isolated queue failure')
        with self.assertRaises(OSError):
            bridge.process_update(self.update('Текст'),'-1',100,enqueue_bonus=failed,enqueue_call=failed,save_offset=offsets.append,report=lambda *a:None)
        self.assertEqual(offsets,[])

    def test_actual_launchd_path_and_retry_after_offset_failure_or_archival(self):
        base=Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(prefix='tg-phone-test-') as tmp:
            root=Path(tmp);(root/'director').mkdir();(root/'relay').mkdir();shutil.copy2(base/'relay/owner-dialogue-contract.mjs',root/'relay/owner-dialogue-contract.mjs')
            for name in ['ring.sh','call.mjs','director/owner-calls.mjs']: shutil.copy2(base/name,root/name)
            offsets=[]
            def failed_offset(value): raise OSError('isolated cursor failure')
            def queue(*args): return bridge.queue_call(root,*args)
            params=dict(enqueue_bonus=lambda *a:None,enqueue_call=queue,report=lambda *a:None)
            with patch.dict(os.environ,{'PATH':'/usr/bin:/bin:/usr/sbin:/sbin'}):
                with self.assertRaises(OSError):
                    bridge.process_update(self.update('Позвони репортёру: Текст'),'-1',100,save_offset=failed_offset,**params)
                files=list((root/'calls').glob('*.json'));self.assertEqual(len(files),1)
                saved=json.loads(files[0].read_text());self.assertEqual(saved['target'],'reporter');self.assertEqual(saved['text'],'Текст')
                bridge.process_update(self.update('Позвони репортёру: Текст'),'-1',100,save_offset=offsets.append,**params)
                self.assertEqual(len(list((root/'calls').glob('*.json'))),1)
                (root/'calls/done').mkdir();files[0].rename(root/'calls/done'/files[0].name)
                bridge.process_update(self.update('Позвони репортёру: Текст'),'-1',100,save_offset=offsets.append,**params)
                self.assertEqual(list((root/'calls').glob('*.json')),[])
                self.assertEqual(len(list((root/'calls/done').glob('*.json'))),1)
                self.assertEqual(offsets,[4,4])
                with self.assertRaises(bridge.InvalidCall): queue('Changed','reporter',bridge.call_id('-1',8,110))

    def test_identity_preserves_channel_order_and_new_post_is_new_call(self):
        self.assertLess(bridge.call_id('-1',8,110),bridge.call_id('-1',9,110))
        self.assertLess(bridge.call_id('-1',9,110),bridge.call_id('-1',10,111))
        self.assertNotEqual(bridge.call_id('-1',8,110),bridge.call_id('-2',8,110))

if __name__=='__main__': unittest.main()
