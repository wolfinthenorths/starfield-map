'use strict';
const tg = window.Telegram?.WebApp;
const initData = tg?.initData || '';
const real = Boolean(initData);
const $ = id => document.getElementById(id);
const roman = {1:'I',2:'II',3:'III'};
const fallbackFaq = [
  {id:'purpose',question:'Для чего нужен мистериум?',answer:'Мистериум необходим для поддержания контроля при гулификации. Полная доза: I степень — 1 единица, II — 2 единицы, III — 3 единицы.'},
  {id:'interval',question:'Как часто принимать дозу?',answer:'Полная доза нужна каждые 10 собственных игровых ходов. Выдача препарата не считается его приёмом.'},
  {id:'turn',question:'Что считается ходом?',answer:'Собственный игровой пост с действием, в том числе передвижением или отыгрышем реквеста. Обычные диалоги, спасброски, технические сообщения и дополнительные ответы не засчитываются.'},
  {id:'missed',question:'Что будет при пропуске приёма?',answer:'После первых 10 ходов без новой дозы: следующие ходы 1–3 — помеха, 4-й — мастер может изменить реквест, 5-й — полная передача управления мастеру. Полная доза возвращает контроль и сбрасывает счётчик.'},
  {id:'access',question:'Как повысить доступ?',answer:'Стартовый доступ к системам — 1. Повышение требует отдельного тестирования у мастера. Уровень персонажа начинается с 0 и учитывается отдельно.'},
  {id:'materials',question:'Где найти материалы проекта?',answer:'Материалы проекта доступны на DOTD Dossier и в архиве Starfield. Действующие условия конкретной сцены уточняет мастер.'}
];
let profile = {name:'Посетитель',character:'',degree:null,access_level:1};
let events = [], degree = null, busy = false, opened = false, frame = 0;
let sound = false;
try { sound = localStorage.getItem('protectoron-sound') === 'on'; } catch {}
const canvas = $('scene'), ctx = canvas.getContext('2d');
const sprites = {};
const sounds = Object.fromEntries(['click','box-open','box-close','confirm','robot','denied'].map(name => [name,new Audio(`/assets/audio/${name}.mp3`)]));
Object.values(sounds).forEach(audio => {audio.preload='auto';audio.volume=.22;});
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let issuanceKey = null, accessKey = null;
function freshKey(){return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function haptic(type='light'){try {tg?.HapticFeedback?.impactOccurred(type);} catch {}}
function play(name){if(!sound)return;const a=sounds[name];if(!a)return;a.currentTime=0;a.play().catch(()=>{});}
function updateSound(){ $('sound').setAttribute('aria-pressed',String(sound));$('sound').textContent=`ЗВУК: ${sound?'ВКЛ.':'ВЫКЛ.'}`; }
function showError(text){$('error').textContent=text;$('error').hidden=false;play('denied');}
function clearError(){$('error').hidden=true;}
async function api(path, data={}){
  if(!real) throw new Error('Откройте терминал из личного чата с @ptotectoronbot.');
  let response;
  try {response=await fetch(`/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,...data}),signal:AbortSignal.timeout(20000)});}
  catch {throw new Error('Нет связи с контроллером. Проверьте соединение и повторите обращение.');}
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Контроллер временно недоступен.');
  return result;
}
function setTab(name){
  document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===name));
  document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  play('click');haptic();clearError();
}
function sync(data){
  if(data.profile)profile=data.profile;
  if(data.events)events=data.events;
  $('character').value=profile.character||'';
  $('access-level').textContent=String(profile.access_level).padStart(2,'0');
  $('next-level').textContent=`До уровня ${profile.access_level+1}`;
  renderHistory();renderFaq(data.faq||fallbackFaq);
}
function renderHistory(){
  const list=$('history-list');list.replaceChildren();
  if(!events.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Обращений пока нет. Выдачи и запросы на доступ появятся здесь.';list.append(p);return;}
  for(const event of events){
    const el=document.createElement('article');el.className='history-entry';
    const img=document.createElement('img');img.src=event.kind==='dispense'?'/assets/mysterium.png':'/assets/terminal-cut.png';img.alt='';
    const body=document.createElement('div'),title=document.createElement('strong'),desc=document.createElement('p'),date=document.createElement('time');
    title.textContent=event.kind==='dispense'?'Выдача мистериума':'Запрос на повышение доступа';
    desc.textContent=event.kind==='dispense'?`${roman[event.payload.degree]} степень · ${event.payload.units} ${event.payload.units===1?'единица':'единицы'} · полная доза`:`${event.payload.target} · ожидает тестирования`;
    const time=new Date(event.created_at*1000);date.dateTime=time.toISOString();date.textContent=time.toLocaleString('ru-RU',{day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'});
    body.append(title,desc,date);el.append(img,body);list.append(el);
  }
}
function renderFaq(items){
  const list=$('faq-list');list.replaceChildren();
  for(const item of items){
    const details=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p'),button=document.createElement('button');
    summary.textContent=item.question;p.textContent=item.answer;p.className='faq-answer';
    button.type='button';button.className='secondary-button faq-send';button.textContent='Ответить в личном чате';button.disabled=!real;
    button.addEventListener('click',async()=>{button.disabled=true;try{await api('faq',{id:item.id});button.textContent='Ответ отправляется в чат';play('confirm');}catch(e){showError(e.message);button.disabled=false;}});
    details.append(summary,p,button);list.append(details);
  }
}
function drawScene(){
  ctx.clearRect(0,0,640,320);ctx.imageSmoothingEnabled=false;
  // Every object is an existing sprite. Lighting and labels belong to the UI.
  if(sprites.floor){
    ctx.globalAlpha=.48;
    for(let row=0;row<5;row++)for(let col=0;col<8;col++){
      const x=82+col*52-row*26,y=150+row*24;
      ctx.drawImage(sprites.floor,x,y,104,52);
    }
    ctx.globalAlpha=1;
  }
  ctx.fillStyle='#090e0aa0';ctx.beginPath();ctx.ellipse(185,262,48,16,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(393,264,67,23,0,0,Math.PI*2);ctx.fill();
  if(sprites.robot)ctx.drawImage(sprites.robot,121,108,130,150);
  if(sprites.case){
    const scale=4,fw=56,fh=64;
    // Match the original map's fixed container pivot through all ten frames.
    if(frame>0&&sprites.opening)ctx.drawImage(sprites.opening,frame*fw,0,fw,fh,393-(16+12)*scale,264-(32+28)*scale,fw*scale,fh*scale);
    else ctx.drawImage(sprites.case,393-16*scale,264-32*scale,32*scale,32*scale);
  }
  if(opened&&sprites.vial){
    const count=degree||1;
    for(let i=0;i<count;i++)ctx.drawImage(sprites.vial,367+(i-(count-1)/2)*24,185,48,48);
  }
}
async function animateOpen(){
  play('box-open');$('scene-state').textContent='ОТСЕК ОТКРЫВАЕТСЯ';
  canvas.setAttribute('aria-label','Робот-контроллер открывает контейнер мистериума');
  if(reducedMotion){frame=9;opened=true;drawScene();}
  else await new Promise(resolve=>{
    const start=performance.now();
    function tick(now){const p=Math.min(1,(now-start)/850);frame=Math.min(9,Math.floor(p*10));drawScene();if(p<1)requestAnimationFrame(tick);else{opened=true;drawScene();resolve();}}
    requestAnimationFrame(tick);
  });
  $('scene-state').textContent='КАССЕТА ДОСТУПНА';
  canvas.setAttribute('aria-label',`Робот-контроллер рядом с открытым контейнером: ${degree||1} единиц мистериума`);
}
function showReceipt(receipt){
  degree=receipt.degree;$('degree-panel').hidden=true;$('receipt-panel').hidden=false;
  $('receipt-dose').textContent=`${receipt.units} ${receipt.units===1?'единица':'единицы'} · полная доза`;
  $('scene-hint').textContent=`Степень ${roman[degree]} · выдача зафиксирована`;
  $('robot-speech').textContent=`«Степень гулификации ${roman[degree]}. Индивидуальная доза подготовлена. Пожалуйста, соблюдайте интервал приёма».`;
}
function selectDegree(value){
  degree=value;document.querySelectorAll('[data-degree]').forEach(button=>{const selected=Number(button.dataset.degree)===value;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  $('dispense-button').disabled=busy||!real;
  $('robot-speech').textContent=`«Степень гулификации ${roman[value]} принята. Полная доза — ${value} ${value===1?'единица':'единицы'}. Контейнер готов к выдаче».`;
  $('scene-hint').textContent=`Подготовлена дозировка для ${roman[value]} степени`;play('click');haptic();
}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
document.querySelectorAll('[data-degree]').forEach(button=>button.addEventListener('click',()=>{if(!busy)selectDegree(Number(button.dataset.degree));}));
$('sound').addEventListener('click',()=>{sound=!sound;try{localStorage.setItem('protectoron-sound',sound?'on':'off');}catch{}updateSound();if(sound)play('robot');});
$('dispense-button').addEventListener('click',async()=>{
  if(busy||!degree)return;busy=true;clearError();$('dispense-button').disabled=true;document.querySelectorAll('[data-degree]').forEach(b=>b.disabled=true);
  $('dispense-button').firstElementChild.textContent='Обработка обращения…';
  if(!issuanceKey)issuanceKey=freshKey();
  try{
    const data=await api('dispense',{degree,requestId:issuanceKey});
    sync(data);await animateOpen();showReceipt(data.receipt);play('confirm');haptic('medium');
  }catch(e){showError(e.message);$('dispense-button').disabled=!real;}
  finally{busy=false;document.querySelectorAll('[data-degree]').forEach(b=>b.disabled=false);$('dispense-button').firstElementChild.textContent='Получить мистериум';}
});
$('again-button').addEventListener('click',()=>{
  if(busy)return;play('box-close');opened=false;frame=0;degree=null;issuanceKey=null;drawScene();$('receipt-panel').hidden=true;$('degree-panel').hidden=false;$('scene-state').textContent='ЗАМОК ЗАКРЫТ';$('scene-hint').textContent='Ожидание обращения';$('robot-speech').textContent='«Для подготовки индивидуальной дозы укажите степень гулификации вашего персонажа».';
  document.querySelectorAll('[data-degree]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});$('dispense-button').disabled=true;
});
async function requestAccess(target){
  if(busy)return;busy=true;clearError();$('access-next').disabled=true;$('access-form').querySelector('button').disabled=true;
  if(!accessKey)accessKey=freshKey();
  try{const data=await api('access',{target,requestId:accessKey});sync(data);accessKey=null;$('access-result').textContent=`«Запрос зарегистрирован: ${target}. Для повышения допуска требуется отдельное тестирование у мастера». Сообщение отправляется в личный чат.`;$('access-result').hidden=false;play('confirm');haptic('medium');}
  catch(e){showError(e.message);}finally{busy=false;$('access-next').disabled=!real;$('access-form').querySelector('button').disabled=!real;}
}
$('access-next').addEventListener('click',()=>requestAccess(`Доступ к системам: уровень ${profile.access_level+1}`));
$('access-form').addEventListener('submit',e=>{e.preventDefault();const target=$('access-target').value.trim();if(target)requestAccess(target);});
$('profile-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;try{const data=await api('profile',{character:$('character').value});sync(data);$('profile-status').textContent='Имя персонажа сохранено.';play('confirm');}catch(error){showError(error.message);}finally{button.disabled=!real;}});
async function loadSprites(){
  await Promise.all(Object.entries({case:'box-cut.png',opening:'boxOpening-cut.png',robot:'robotSprite-cut.png',floor:'floor-cut.png',vial:'mysterium.png'}).map(([key,file])=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{sprites[key]=img;resolve();};img.onerror=()=>reject(new Error('Не удалось загрузить спрайты. Обновите терминал.'));img.src=`/assets/${file}`;})));
  drawScene();
}
async function start(){
  updateSound();renderFaq(fallbackFaq);renderHistory();
  try{tg?.ready();tg?.expand();tg?.setHeaderColor('#141914');tg?.setBackgroundColor('#141914');if(tg?.isVersionAtLeast?.('7.10'))tg.setBottomBarColor('#141914');}catch{}
  try{await loadSprites();}catch(e){showError(e.message);}
  if(real){
    try{
      const data=await api('state');sync(data);$('connection-label').textContent=`На связи · ${profile.character||profile.name}`;
      const receiptId=new URLSearchParams(location.search).get('receipt');
      const receipt=events.find(e=>e.id===receiptId&&e.kind==='dispense');
      if(receipt){degree=receipt.payload.degree;await animateOpen();showReceipt({...receipt.payload,id:receipt.id});}
    }catch(e){$('connection-label').textContent='Нет связи с контроллером';showError(e.message);}
  }else{
    $('connection-label').textContent='Просмотр терминала';$('demo-notice').hidden=false;
    $('access-next').disabled=true;$('access-form').querySelector('button').disabled=true;$('profile-form').querySelector('button').disabled=true;
  }
}
start();
