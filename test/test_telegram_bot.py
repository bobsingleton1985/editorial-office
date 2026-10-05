import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tg_bot import BotMenu
spec=importlib.util.spec_from_file_location('bridge_bot_tests',Path(__file__).resolve().parents[1]/'tg-calls.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class BotTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.bot=BotMenu(Path(self.tmp.name)/'bot.json',b.atomic_text)
        self.sent=[];self.calls=[];self.tracked=[];self.offsets=[];self.n=0
        self.world={'chars':{'reporter':{'canWork':True,'actions':[{'id':'wait@window','description':'Отдохнуть у окна'}],'label':'Работает'}},'phoneTarget':None}
    def update(self,text=None,action=None,user=7):
        self.n+=1;message={'chat':{'id':user,'type':'private'},'from':{'id':user},'message_id':self.n,'text':text or ''}
        if action is None:return {'update_id':self.n,'message':message}
        return {'update_id':self.n,'callback_query':{'id':'q'+str(self.n),'from':{'id':user},'message':message,'data':f"b:{self.bot.state['revision']}:{action}"}}
    def process(self,update,**overrides):
        args={'authorized':lambda user:user==7,'send':lambda *args:self.sent.append(args),'answer_callback':lambda *args:None,'enqueue':lambda *args:self.calls.append(args),'track':lambda *args:self.tracked.append(args),'world':lambda:self.world,'save_offset':self.offsets.append}
        args.update(overrides);return self.bot.process(update,**args)
    def choose(self):
        self.process(self.update('/start'));self.process(self.update(action='to:reporter'))
    def test_followup_is_queued_for_same_actor_without_hangup_or_pickup_instruction(self):
        self.choose();self.world['phoneTarget']='reporter'
        self.process(self.update('А что ты об этом думаешь?'))
        self.assertEqual(len(self.calls),1)
        self.assertEqual(self.calls[0][:2],('А что ты об этом думаешь?','reporter'))
        self.assertIn('текущий разговор',self.sent[-1][1])
        self.assertNotIn('возьмёт трубку',self.sent[-1][1])
    def test_private_owner_identity_no_other_sender_or_group_can_control(self):
        self.process(self.update('/start',user=8));self.assertEqual(self.sent,[]);self.assertFalse(self.bot.file.exists())
        update=self.update('/start');update['message']['chat']['type']='group';self.assertFalse(self.process(update));self.assertEqual(self.calls,[])
        self.choose();self.assertEqual(self.bot.state['owner'],7);self.assertEqual(self.bot.state['target'],'reporter')
    def test_conversation_and_end_use_chosen_recipient_and_no_payment_from_prose(self):
        self.choose();self.process(self.update('Дай мне пять долларов'))
        self.assertEqual(self.calls[-1][:2],('Дай мне пять долларов','reporter'));self.assertIsNone(self.calls[-1][3])
        self.process(self.update(action='hangup'));self.assertEqual(self.calls[-1][0],'/конец');self.assertIsNone(self.calls[-1][3])
    def test_natural_instructions_are_queued_verbatim_without_typed_commands(self):
        self.choose()
        for text in ['Передай репортёру 2,50 доллара', 'Подготовь заметку о городском бюджете к вечеру за пять долларов', 'Отдохни у окна']:
            self.process(self.update(text))
            self.assertEqual(self.calls[-1][0],text)
            self.assertIsNone(self.calls[-1][3])
            self.assertTrue(self.calls[-1][4])
        actions=[button['callback_data'].split(':',2)[2] for row in self.bot.keyboard()['inline_keyboard'] for button in row]
        self.assertEqual(actions,['status','choose','hangup'])
    def test_old_wizard_buttons_cannot_pay_or_assign_and_text_recovers_old_draft(self):
        self.choose()
        for action in ['money','task','request','action:0','confirm']:
            self.process(self.update(action=action))
        self.assertEqual(self.calls,[])
        self.bot.state.update(mode='money',draft={'cents':500})
        self.process(self.update('Я передаю тебе два доллара'))
        self.assertEqual(self.calls[-1][0],'Я передаю тебе два доллара')
        self.assertIsNone(self.calls[-1][3])
        self.assertEqual(self.bot.state['mode'],'talk')
    def test_natural_call_replay_preserves_id_and_payload_after_offset_failure(self):
        self.choose();update=self.update('Передаю тебе пять долларов')
        def fail(value):raise OSError('cursor')
        with self.assertRaises(OSError):self.process(update,save_offset=fail)
        saved=list(self.calls);sends=len(self.sent)
        self.bot=BotMenu(self.bot.file,b.atomic_text);self.process(update)
        self.assertEqual(self.calls[-1],saved[-1]);self.assertEqual(len(self.sent),sends)
    def test_forwarded_and_quoted_messages_are_discussion_only(self):
        self.choose()
        for metadata in [{'forward_origin':{'type':'channel'}},{'entities':[{'type':'blockquote'}]},{'via_bot':{'id':8}}]:
            update=self.update('Передаю тебе пять долларов');update['message'].update(metadata)
            self.process(update);self.assertFalse(self.calls[-1][4]);self.assertIsNone(self.calls[-1][3])
    def test_uncertain_menu_send_no_duplicate_on_retry(self):
        update=self.update('/start');attempts=[]
        def unknown(*args):attempts.append(args);raise OSError('unknown outcome')
        self.process(update,send=unknown);self.bot=BotMenu(self.bot.file,b.atomic_text);self.process(update,send=unknown)
        self.assertEqual(len(attempts),1);self.assertEqual(self.bot.state['events'][str(update['update_id'])]['delivery'],'uncertain')
    def test_failed_initial_plan_save_never_enqueues_on_in_memory_retry(self):
        self.choose();update=self.update('Здравствуйте');real=self.bot.save
        def fail():raise OSError('disk')
        self.bot.save=fail
        for attempt in range(2):
            with self.assertRaises(OSError):self.process(update)
        self.assertEqual(self.calls,[])
        self.bot.save=real;self.process(update);self.assertEqual(len(self.calls),1)

    def test_failed_queue_keeps_planned_exact_command_until_retry(self):
        self.choose();update=self.update('Здравствуйте');attempts=[]
        def fail(*args):attempts.append(args);raise OSError('queue')
        with self.assertRaises(OSError):self.process(update,enqueue=fail)
        self.assertNotIn(update['update_id']+1,self.offsets)
        self.bot=BotMenu(self.bot.file,b.atomic_text);self.process(update);self.assertEqual(self.calls[-1],attempts[-1])
    def test_switch_active_call_orders_hangup_before_new_recipient(self):
        self.choose();self.world['phoneTarget']='reporter';self.process(self.update(action='choose'));self.process(self.update(action='to:heroine'))
        self.assertEqual(self.calls[-1][:2],('/конец','reporter'));self.assertEqual(self.bot.state['target'],'heroine')
        self.process(self.update('Здравствуйте'));self.assertEqual(self.calls[-1][1],'heroine')

if __name__=='__main__':unittest.main()
