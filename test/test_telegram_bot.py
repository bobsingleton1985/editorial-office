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
    def test_private_owner_identity_no_other_sender_or_group_can_control(self):
        self.process(self.update('/start',user=8));self.assertEqual(self.sent,[]);self.assertFalse(self.bot.file.exists())
        update=self.update('/start');update['message']['chat']['type']='group';self.assertFalse(self.process(update));self.assertEqual(self.calls,[])
        self.choose();self.assertEqual(self.bot.state['owner'],7);self.assertEqual(self.bot.state['target'],'reporter')
    def test_conversation_and_end_use_chosen_recipient_and_no_payment_from_prose(self):
        self.choose();self.process(self.update('Дай мне пять долларов'))
        self.assertEqual(self.calls[-1][:2],('Дай мне пять долларов','reporter'));self.assertIsNone(self.calls[-1][3])
        self.process(self.update(action='hangup'));self.assertEqual(self.calls[-1][0],'/конец');self.assertIsNone(self.calls[-1][3])
    def test_money_requires_current_explicit_confirmation_and_is_stable_on_offset_retry(self):
        self.choose();self.process(self.update(action='money'));self.process(self.update('2,50'));self.assertEqual(self.calls,[])
        confirm=self.update(action='confirm')
        def fail(value):raise OSError('cursor')
        with self.assertRaises(OSError):self.process(confirm,save_offset=fail)
        saved=list(self.calls);sends=len(self.sent)
        self.bot=BotMenu(self.bot.file,b.atomic_text);self.process(confirm)
        self.assertEqual(self.calls[-1],saved[-1]);self.assertEqual(self.calls[-1][3],{'type':'money','cents':250});self.assertEqual(len(self.sent),sends)
        stale=self.update(action='confirm');stale['callback_query']['data']=confirm['callback_query']['data'];self.process(stale);self.assertEqual(len(self.calls),2)
    def test_task_wizard_no_execution_before_confirmation(self):
        self.choose();self.process(self.update(action='task'))
        for text in ['Городская заметка','Проверить расходы городского бюджета','без срока','5']:
            self.process(self.update(text))
        self.assertEqual(self.calls,[]);self.process(self.update(action='confirm'))
        self.assertEqual(self.calls[-1][3],{'type':'task','title':'Городская заметка','brief':'Проверить расходы городского бюджета','deadlineAt':None,'rewardCents':500})
    def test_request_uses_real_option_and_cancel_does_not_queue(self):
        self.choose();self.process(self.update(action='request'));self.process(self.update(action='action:0'))
        self.process(self.update(action='menu'));self.assertEqual(self.calls,[])
        self.process(self.update(action='request'));self.process(self.update(action='action:0'));self.process(self.update(action='confirm'))
        self.assertEqual(self.calls[-1][3],{'type':'request','action':'wait@window'})
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
