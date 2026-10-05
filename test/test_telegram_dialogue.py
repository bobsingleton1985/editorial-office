import importlib.util
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('dialogue_bridge',Path(__file__).resolve().parents[1]/'tg-calls.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class DeliveryTests(unittest.TestCase):
    def test_failed_durable_tracking_cannot_ack_a_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=b.DialogueDelivery(Path(tmp)/'d.json');real=d.save
            def fail():raise OSError('disk failure')
            d.save=fail
            for attempt in range(2):
                with self.assertRaises(OSError):d.track('same',8,None,'Привет')
            self.assertFalse(d.file.exists())
            d.save=real;d.track('same',8,None,'Привет')
            self.assertIn('same',b.DialogueDelivery(d.file).state['calls'])
    def test_answer_receipt_no_duplicate_or_echo(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=b.DialogueDelivery(Path(tmp)/'dialogue.json');d.track('call',8,None,'Привет')
            t={'id':'ph_call','source':'phone','status':'waiting'}
            snapshot={'chars':{'reporter':{'ownerDialogue':[t]}}}
            d.collect(snapshot);self.assertEqual(d.target,'reporter');sent=[]
            def send(text,message):sent.append((text,message));return {'message_id':42}
            d.flush(send,lambda *a:None);self.assertEqual(sent,[])
            t.update(status='answered',reply='Здравствуйте.',reaction='Рад звонку.')
            d.collect(snapshot);d.flush(send,lambda *a:None)
            restarted=b.DialogueDelivery(d.file);restarted.collect(snapshot);restarted.flush(send,lambda *a:None)
            self.assertEqual(len(sent),1);self.assertEqual(sent[0][1],8)
            self.assertTrue(restarted.is_own_reply(42,'Anything'));self.assertTrue(restarted.is_own_reply(99,sent[0][0]))
            update={'update_id':10,'channel_post':{'chat':{'id':-1},'message_id':42,'date':110,'text':sent[0][0]}}
            events=[]
            result=b.process_update(update,'-1',100,enqueue_bonus=lambda *a:events.append(a),enqueue_call=lambda *a:events.append(a),save_offset=lambda *a:None,report=lambda *a:None,is_own_reply=restarted.is_own_reply)
            self.assertEqual(result,'own_reply');self.assertEqual(events,[])

    def test_unknown_delivery_and_crash_do_not_resend(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=b.DialogueDelivery(Path(tmp)/'d.json');d.track('call',1,'heroine','Привет')
            d.collect({'chars':{'heroine':{'ownerDialogue':[{'id':'ph_call','source':'phone','status':'answered','reply':'Привет','reaction':'Радость'}]}}})
            sends=[]
            def unknown(*a):sends.append(a);raise OSError('Unknown network outcome')
            d.flush(unknown,lambda *a:None);self.assertEqual(d.state['calls']['call']['status'],'uncertain')
            b.DialogueDelivery(d.file).flush(unknown,lambda *a:None);self.assertEqual(len(sends),1)
            d.state['calls']['call']['status']='sending';d.save()
            restarted=b.DialogueDelivery(d.file);self.assertEqual(restarted.state['calls']['call']['status'],'uncertain')
            restarted.flush(unknown,lambda *a:None);self.assertEqual(len(sends),1)

    def test_track_before_offset_retry_keeps_original_recipient(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=b.DialogueDelivery(Path(tmp)/'d.json');events=[]
            u={'update_id':3,'channel_post':{'chat':{'id':-1},'message_id':8,'date':110,'text':'Привет'}}
            def offset(value):self.assertTrue(d.file.exists());raise OSError('cursor failure')
            args=dict(enqueue_bonus=lambda *a:None,enqueue_call=lambda *a:events.append(a),report=lambda *a:None,track_call=d.track,replay_target=lambda id,target:d.state['calls'].get(id,{}).get('target',target))
            with self.assertRaises(OSError):b.process_update(u,'-1',100,save_offset=offset,**args)
            d.state['target']='reporter'
            b.process_update(u,'-1',100,save_offset=lambda *a:None,conversation_target=d.target,**args)
            self.assertEqual(events[0],events[1]);self.assertIsNone(events[1][1])
            u['channel_post']['message_id']=9
            b.process_update(u,'-1',100,save_offset=lambda *a:None,conversation_target=d.target,**args)
            self.assertEqual(events[-1][1],'reporter')

    def test_end_clears_recipient_after_answer(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=b.DialogueDelivery(Path(tmp)/'d.json');d.track('end',9,'reporter','/конец')
            d.collect({'chars':{'reporter':{'ownerDialogue':[{'id':'ph_end','source':'phone','status':'answered','reply':'До свидания','reaction':'Спокойствие'}]}}})
            d.flush(lambda *a:{'message_id':55},lambda *a:None);self.assertIsNone(d.target)

if __name__=='__main__':unittest.main()
