// Physical availability for the separate HER skeleton; no invented biography.
export const HEROINE_PROFILE = {
  name:'Героиня', home:null, actorKind:'heroine-her',
  startPlaces:['window2','teletype','tv3','tv4','tv','window'],
  role:'героиня редакции; зарабатывает согласованными выступлениями или доставкой напитков в выбранном режиме',
  character:'Индивидуальный характер и биография ещё не заданы владельцем. В режиме с танцами заработок доступен за полностью исполненное согласованное выступление; обычные танцы бесплатны. При наличии исполнимого обслуживания можно предложить коллегам напитки с доставкой на подносе: по цене и распределению дохода из текущих finances, только за подтверждённую доставку согласившимся гостям. При готовности нового обслуживания можно принять заказ на одного, двоих или троих, предложить одному или всем; угощение оплачивает явно указанный инициатор. Доступные действия отражают текущий режим и готовность исполнителя. Учитывай цену еды и собственный баланс, ищи согласованный заказ при нехватке денег. Для привлечения заказов можно самостоятельно вкладывать время в адресный флирт, знакомство и доступное угощение коллег; недавняя взаимность может повысить их интерес к выступлению. Опьянение усиливает потребность во флирте, но чужая реакция и покупка не гарантированы. Оценивай стоимость угощения и выраженные ответы, уважай отказы; не следуй обязательной цепочке. Не придумывай прошлое или устойчивые черты; выбирай только доступное по текущей ситуации и собственным потребностям.',
  personality:{}, grow:{hunger:.5,music:.3,dance:.2,coffee:.75,drunk:-.4}, fatigue:1,
  start:{hunger:30,music:15,dance:10},
};
const activity=(label,seconds,at,options={})=>({rate:0,dwell:[seconds,seconds],once:true,needs:{},people:['heroine'],when:null,
  where:[{at,label,jev:label+'; исполнить собственное принятое движение героини один раз.'}],...options});
export const HEROINE_ACTIVITIES = {
  heroine_tv_channel:activity('переключает канал телевизора',9,'tv_knob'),
  heroine_serve:activity('обслуживает гостей с подносом',300,'bar'),
  heroine_coffee:activity('пьёт кофе',5.066666603088379,'coffee_seat',{needs:{coffee:-60}}),
  heroine_love1:activity('исполняет игривый жест любви',20,'tv_dance'),
  heroine_pose1:activity('принимает игривую позу',16.8416666667,'tv_dance'),
  heroine_listen:{rate:0,dwell:[30,60],once:false,needs:{music:-20},people:['heroine'],when:'music',where:[{at:'tv',label:'слушает музыку',jev:'Подойти в зону телевизора и спокойно послушать звучащую музыку в собственной нейтральной стойке; это слушание, без танца.'}]},
  heroine_pour:activity('наливает в бокал у бара',12.9666666667,'bar'),
  heroine_dance1:activity('танцует — вариант 1',38.5833333333,'tv_dance',{when:'music',rate:4,needs:{dance:-40}}),
  heroine_dance2:activity('танцует — вариант 2',37.3666666667,'tv_dance',{when:'music',rate:4,needs:{dance:-40}}),
};
// Addressed gestures are selected only inside the shared conversation engine.
// Work still requires separate HER-compatible execution; smoking is standing only.
// Desk sleep uses the heroine’s own five-clip native entry/loop/exit bank.
const allowed=new Set(['drink_invite','drink_reply','drink_join','drink_cancel','phone','smoke','money_drinks_order','money_drinks_performer','money_drinks_offer','money_drinks_reply','money_drinks_start','money_drinks_cancel','whisky','courtship_reply','money_performance_watch','money_performance_offer','money_performance_reply','money_performance_start','money_performance_cancel','continue','wait','sleep_desk','rest_lounge','lunch','conversation','social_invite','social_join','music_ask','social_leave','social_style','social_intent','social_relation','relationship_appraise','money_offer','money_treat','money_extend','money_remind','money_reply','money_repay','money_forgive',...Object.keys(HEROINE_ACTIVITIES)]);
export const heroineSupports=verb=>allowed.has(verb);
