'use strict';
const tg = window.Telegram?.WebApp;
const initData = tg?.initData || '';
const real = Boolean(initData);
const $ = id => document.getElementById(id);
const roman = {1:'I',2:'II',3:'III'};
const fallbackFaq = [
  {id:'purpose',question:'Для чего нужен мистериум?',answer:'Мистериум поддерживает контроль при гулификации, а необходимое количество препарата определяется её степенью: I — 1 единица, II — 2 единицы, III — 3 единицы.'},
  {id:'interval',question:'Как часто нужно принимать препарат?',answer:'Препарат необходимо принимать в полном назначенном количестве каждые 10 Ваших игровых ходов; поскольку получение не считается приёмом, сам приём Вы отыгрываете отдельно.'},
  {id:'turn',question:'Что считается ходом?',answer:'Собственный игровой пост с действием, в том числе передвижением или отыгрышем реквеста. Обычные диалоги, спасброски, технические сообщения и дополнительные ответы не засчитываются.'},
  {id:'missed',question:'Что будет при пропуске приёма?',answer:'После первых 10 ходов без нового приёма препарата: следующие ходы 1–3 — помеха, на 4-м условия проверок могут быть изменены, на 5-м наступает полная потеря контроля над персонажем. Приём полного назначенного количества препарата восстанавливает контроль и сбрасывает счётчик.'},
  {id:'access',question:'Как повысить доступ?',answer:'Выберите службу и нужный уровень полномочий, чтобы перейти к тесту на повышение квалификации; ссылка на испытание будет добавлена позже. Уровни разных служб учитываются отдельно, а Ω не является пятым уровнем и не выдаётся штатным сотрудникам.'},
  {id:'materials',question:'Где найти материалы проекта?',answer:'Материалы проекта доступны в Telegram по ссылке https://t.me/dawnofthed3ad, а перейти в архив Starfield Вы можете через справочный модуль.'}
];
let profile = {name:'Посетитель',character:'',degree:null,access_level:1};
let events = [], degree = null, busy = false, opened = false, frame = 0;
let sound = false;
try { sound = localStorage.getItem('protectoron-sound') === 'on'; } catch {}
const canvas = $('scene'), ctx = canvas.getContext('2d');
const sprites = {};
const sounds = Object.fromEntries(['click','box-open','box-close','confirm','robot','denied'].map(name => [name,new Audio(`/assets/audio/${name}.mp3`)]));
Object.values(sounds).forEach(audio => {audio.preload='auto';audio.volume=.22;});
let audioContext=null,audioLoading=null;
const audioBuffers={};
function unlockAudio(){
  if(!sound)return Promise.resolve();
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return Promise.resolve();
  if(!audioContext)audioContext=new AudioContext();
  // Resume synchronously from a tap; decoded existing MP3s remain playable after API responses on iOS.
  const resumed=audioContext.resume().catch(()=>{});
  if(!audioLoading)audioLoading=Promise.all(Object.keys(sounds).map(async name=>{
    try{const response=await fetch(`/assets/audio/${name}.mp3`);audioBuffers[name]=await audioContext.decodeAudioData(await response.arrayBuffer());}catch{}
  }));
  return Promise.all([resumed,audioLoading]);
}
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let issuanceKey = null, accessKey = null;
let accessCatalog=null,selectedService=null;
let ownCharacter=null,characters=[],requests=[],selectedRecipient=null,companionKey=null,gmConnected=false;
let waitingRequestId=null;
function freshKey(){return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function haptic(type='light'){try {tg?.HapticFeedback?.impactOccurred(type);} catch {}}
function play(name){
  if(!sound)return;
  unlockAudio();
  if(audioContext?.state==='running'&&audioBuffers[name]){const source=audioContext.createBufferSource(),gain=audioContext.createGain();source.buffer=audioBuffers[name];gain.gain.value=.22;source.connect(gain);gain.connect(audioContext.destination);source.start();return;}
  const a=sounds[name];if(!a)return;a.currentTime=0;a.play().catch(()=>{});
}
function updateSound(){ $('sound').setAttribute('aria-pressed',String(sound));$('sound').textContent=`ЗВУК: ${sound?'ВКЛ.':'ВЫКЛ.'}`; }
function showError(text){$('error').textContent=text;$('error').hidden=false;play('denied');}
function clearError(){$('error').hidden=true;}
async function api(path, data={}){
  if(!real) throw new Error('Откройте робота из личного чата с @ptotectoronbot.');
  let response;
  try {response=await fetch(`/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,...data}),signal:AbortSignal.timeout(20000)});}
  catch {throw new Error('Связь с контроллером прервалась; пожалуйста, проверьте соединение и повторите обращение.');}
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
  if(document.activeElement!==$('character'))$('character').value=profile.character||'';
  if('own_character' in data)ownCharacter=data.own_character;
  if(data.characters)characters=data.characters;
  if(data.requests)requests=data.requests;
  if('gm_connected' in data)gmConnected=data.gm_connected;
  $('registration-panel').hidden=Boolean(ownCharacter);
  if($('receipt-panel').hidden)$('degree-panel').hidden=!ownCharacter||!$('companion-panel').hidden;
  if(ownCharacter){
    if(!opened)degree=ownCharacter.degree;
    $('own-name').textContent=ownCharacter.name;
    $('own-details').textContent=ownCharacter.class+(ownCharacter.degree?` · ${roman[ownCharacter.degree]} степень гулификации`:'');
    $('own-dose-note').textContent=ownCharacter.eligible?`Назначенное количество препарата: ${ownCharacter.degree} ${ownCharacter.degree===1?'единица':'единицы'}.`:'Личная выдача мистериума для Вашего класса недоступна. Для получения препарата с целью передачи иному лицу — напишите рапорт.';
    $('dispense-button').disabled=!real||!ownCharacter.eligible;
    $('companion-open').disabled=!real||!gmConnected;
    if(!opened)$('robot-speech').textContent=`«Добрый день, ${ownCharacter.name}! Данные реестра проверены, укажите цель обращения?»`;
  }
  renderRequests();
  if(data.accesses&&!accessCatalog){accessCatalog=data.accesses;renderAccesses();}
  renderHistory();renderFaq(data.faq||fallbackFaq);
}
function renderHistory(){
  const list=$('history-list');list.replaceChildren();
  if(!events.length){const p=document.createElement('p');p.className='empty-state';p.textContent='После Вашего первого обращения здесь появятся записи о выдаче препарата и запросах на повышение доступа.';list.append(p);return;}
  for(const event of events){
    const el=document.createElement('article');el.className='history-entry';
    const img=document.createElement('img');img.src=event.kind==='dispense'?'/assets/mysterium.webp':'/assets/terminal-cut.png';img.alt='';
    const body=document.createElement('div'),title=document.createElement('strong'),desc=document.createElement('p'),date=document.createElement('time');
    title.textContent=event.kind==='dispense'?'Выдача мистериума':'Запрос на повышение доступа';
    desc.textContent=event.kind==='dispense'?`${roman[event.payload.degree]} степень · ${event.payload.units} ${event.payload.units===1?'единица':'единицы'} препарата`:`${event.payload.target} · ожидает тестирования`;
    const time=new Date(event.created_at*1000);date.dateTime=time.toISOString();date.textContent=time.toLocaleString('ru-RU',{day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'});
    body.append(title,desc,date);el.append(img,body);list.append(el);
  }
}
function renderFaq(items){
  const list=$('faq-list');
  const existing=new Map(Array.from(list.children,item=>[item.dataset.faqId,item]));
  const retained=new Set();
  for(const [index,item] of items.entries()){
    let details=existing.get(item.id);
    if(!details){
      details=document.createElement('details');details.dataset.faqId=item.id;
      const summary=document.createElement('summary'),answer=document.createElement('p');
      answer.className='faq-answer';details.append(summary,answer);
    }
    const summary=details.querySelector('summary'),answer=details.querySelector('.faq-answer');
    if(summary.textContent!==item.question)summary.textContent=item.question;
    if(answer.textContent!==item.answer)answer.textContent=item.answer;
    // Polling must retain the actual disclosure node, its open state and focus.
    if(list.children[index]!==details)list.insertBefore(details,list.children[index]||null);
    retained.add(item.id);
  }
  for(const [id,details] of existing)if(!retained.has(id))details.remove();
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
    const height=76,width=Math.round(height*sprites.vial.width/sprites.vial.height);
    for(let i=0;i<count;i++){ctx.save();ctx.translate(389+(i-(count-1)/2)*18,222+(i-(count-1)/2)*8);ctx.rotate(-Math.PI/3);ctx.drawImage(sprites.vial,-width/2,-height/2,width,height);ctx.restore();}
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
  $('scene-state').textContent='ПРЕПАРАТ ДОСТУПЕН';
  canvas.setAttribute('aria-label',`Робот-контроллер рядом с открытым контейнером: ${degree||1} единиц мистериума`);
}
function showReceipt(receipt){
  degree=receipt.degree;$('degree-panel').hidden=true;$('receipt-panel').hidden=false;
  $('receipt-dose').textContent=`${receipt.units} ${receipt.units===1?'единица':'единицы'} препарата`;
  if(receipt.for_companion)$('receipt-dose').textContent+=` · для ${receipt.recipient}`;
  $('scene-hint').textContent=`Степень ${roman[degree]} · выдача зафиксирована`;
  $('robot-speech').textContent=receipt.for_companion?`«Выдача для ${receipt.recipient} согласована по Вашему рапорту, препарат подготовлен и доступен к получению».`:`«Препарат для ${roman[degree]} степени гулификации подготовлен в назначенном количестве; пожалуйста, соблюдайте установленный интервал приёма».`;
}
function selectDegree(value){
  degree=value;document.querySelectorAll('[data-degree]').forEach(button=>{const selected=Number(button.dataset.degree)===value;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  $('dispense-button').disabled=busy||!real;
  $('robot-speech').textContent=`«Для ${roman[value]} степени гулификации назначено ${value} ${value===1?'единица':'единицы'} препарата, поэтому контейнер подготовлен к выдаче соответствующего количества».`;
  $('scene-hint').textContent=`Подготовлена дозировка для ${roman[value]} степени`;play('click');haptic();
}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
document.querySelectorAll('[data-degree]').forEach(button=>button.addEventListener('click',()=>{if(!busy)selectDegree(Number(button.dataset.degree));}));
$('sound').addEventListener('click',()=>{sound=!sound;try{localStorage.setItem('protectoron-sound',sound?'on':'off');}catch{}updateSound();if(sound)unlockAudio().then(()=>play('robot'));});
document.addEventListener('pointerdown',()=>{if(sound)unlockAudio();},{passive:true});
$('dispense-button').addEventListener('click',async()=>{
  if(busy||!ownCharacter?.eligible)return;busy=true;clearError();$('dispense-button').disabled=true;
  play('click');
  $('dispense-button').firstElementChild.textContent='Обработка обращения…';
  if(!issuanceKey)issuanceKey=freshKey();
  try{
    const data=await api('dispense',{requestId:issuanceKey});
    sync(data);await animateOpen();showReceipt(data.receipt);play('confirm');haptic('medium');
  }catch(e){showError(e.message);$('dispense-button').disabled=!real||!ownCharacter?.eligible;}
  finally{busy=false;$('dispense-button').firstElementChild.textContent='Получить мистериум';}
});
$('again-button').addEventListener('click',()=>{
  if(busy)return;play('box-close');opened=false;frame=0;degree=ownCharacter?.degree||null;issuanceKey=null;drawScene();$('receipt-panel').hidden=true;$('degree-panel').hidden=!ownCharacter;$('scene-state').textContent='ЗАМОК ЗАКРЫТ';$('scene-hint').textContent='Ожидание обращения';$('robot-speech').textContent=ownCharacter?`«Добрый день, ${ownCharacter.name}! Данные реестра проверены, укажите цель обращения?»`:'«Назовите Вашего персонажа для проверки реестра».';$('dispense-button').disabled=!real||!ownCharacter?.eligible;
});
async function requestAccess(target){
  if(busy||!real)return;busy=true;clearError();document.querySelectorAll('[data-access-level]').forEach(b=>b.disabled=true);
  if(!accessKey)accessKey=freshKey();
  try{const data=await api('access',{target,requestId:accessKey});sync(data);accessKey=null;$('access-result').replaceChildren();const text=document.createElement('p');text.textContent=`«Для повышения квалификации и получения допуска ${target} необходимо пройти соответствующий тест».`;$('access-result').append(text);
    if(data.request.test_url){const link=document.createElement('a');link.href=data.request.test_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=`Пройти тест · ${target}`;$('access-result').append(link);}else{const note=document.createElement('p');note.textContent='Ссылка на тест для этого допуска будет добавлена позже.';$('access-result').append(note);}
    $('access-result').hidden=false;play('confirm');haptic('medium');}
  catch(e){showError(e.message);}finally{busy=false;document.querySelectorAll('[data-access-level]').forEach(b=>b.disabled=!real||!ownCharacter);}
}
function renderAccesses(){
  if(!accessCatalog)return;const list=$('access-services');list.replaceChildren();
  for(const service of accessCatalog.services){const button=document.createElement('button');button.type='button';button.className='service-button';const code=document.createElement('strong'),name=document.createElement('span');code.textContent=service.code;name.textContent=service.name;button.append(code,name);button.addEventListener('click',()=>selectService(service));list.append(button);}
}
function selectService(service){
  selectedService=service;$('access-services').hidden=true;$('access-level-panel').hidden=false;$('access-result').hidden=true;$('access-code').textContent=service.code;$('service-description').textContent=service.description;accessKey=null;
  const list=$('access-levels');list.replaceChildren();
  for(const level of accessCatalog.levels.filter(item=>item.level>1)){const button=document.createElement('button');button.type='button';button.className='choice-button';button.dataset.accessLevel=String(level.level);button.disabled=!real||!ownCharacter;const title=document.createElement('span'),sub=document.createElement('small'),arrow=document.createElement('span');title.textContent=`${service.code}-${level.level}`;sub.textContent=level.name;arrow.textContent='→';arrow.setAttribute('aria-hidden','true');button.append(title,sub,arrow);button.addEventListener('click',()=>requestAccess(`${service.code}-${level.level}`));list.append(button);}play('click');haptic();
}
$('change-service').addEventListener('click',()=>{if(busy)return;selectedService=null;accessKey=null;$('access-services').hidden=false;$('access-level-panel').hidden=true;$('access-result').hidden=true;$('access-code').textContent='—';play('click');});
async function registerCharacter(name,statusId){const data=await api('profile',{character:name});sync(data);$(statusId).textContent=data.registration_status==='verified'?'Данные реестра проверены, и Вы можете выбрать необходимое обслуживание.':'Укажите имя персонажа из реестра.';play('confirm');}
$('profile-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;try{await registerCharacter($('character').value,'profile-status');}catch(error){showError(error.message);}finally{button.disabled=!real;}});
$('registration-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;try{await registerCharacter($('registration-name').value,'registration-status');}catch(error){showError(error.message);}finally{button.disabled=!real;}});
function renderRecipients(){
  const list=$('companion-recipients');list.replaceChildren();
  for(const item of characters.filter(item=>item.eligible&&item.name!==ownCharacter?.name)){const button=document.createElement('button');button.className='service-button';button.type='button';const title=document.createElement('strong'),label=document.createElement('span');title.textContent=item.name;label.textContent=`${roman[item.degree]} степень · ${item.degree} ед.`;button.append(title,label);button.classList.toggle('selected',selectedRecipient===item.name);button.addEventListener('click',()=>{selectedRecipient=item.name;companionKey=null;renderRecipients();$('companion-send').disabled=!real;play('click');});list.append(button);}
  if(!list.children.length){const p=document.createElement('p');p.className='fine-print';p.textContent='Других гулей с указанной степенью в реестре нет.';list.append(p);}
}
$('companion-open').addEventListener('click',()=>{if(!ownCharacter)return;$('companion-panel').hidden=false;$('degree-panel').hidden=true;selectedRecipient=null;companionKey=null;$('companion-send').disabled=true;renderRecipients();});
$('companion-back').addEventListener('click',()=>{if(busy)return;$('companion-panel').hidden=true;$('degree-panel').hidden=!ownCharacter;});
$('companion-form').addEventListener('submit',async e=>{e.preventDefault();if(busy||!selectedRecipient)return;busy=true;$('companion-send').disabled=true;if(!companionKey)companionKey=freshKey();try{const data=await api('companion',{recipient:selectedRecipient,report:$('companion-report').value,requestId:companionKey});sync(data);$('companion-status').textContent='Ожидание согласования на выдачу «Мистериума»';showWaiting(data.request.id);companionKey=null;play('confirm');}catch(error){showError(error.message);}finally{busy=false;$('companion-send').disabled=!real;}});
function showWaiting(requestId){
  const request=requests.find(item=>item.id===requestId);
  if(!request||request.status!=='pending')return;
  waitingRequestId=requestId;
  $('waiting-recipient').textContent=`Получатель: ${request.recipient_name}`;
  const dialog=$('waiting-dialog');
  if(!dialog.open)dialog.showModal();
}
$('waiting-minimize').addEventListener('click',()=>{$('waiting-dialog').close();});
function updateWaiting(){
  if(!waitingRequestId)return;
  const request=requests.find(item=>item.id===waitingRequestId);
  if(!request||request.status!=='pending'){
    if($('waiting-dialog').open)$('waiting-dialog').close();
    $('companion-status').textContent=request?.status==='approved'?'Выдача «Мистериума» согласована, и Вы можете подтвердить получение подготовленного препарата.':request?.status==='rejected'?'Выдача «Мистериума» не согласована.':'Состояние обращения обновлено.';
    waitingRequestId=null;
    return;
  }
  $('robot-speech').textContent='«Ваш рапорт принят на рассмотрение; пожалуйста, ожидайте завершения согласования на выдачу «Мистериума»».';
}
function renderRequests(){
  const list=$('requests-list');list.replaceChildren();
  for(const request of requests.filter(item=>item.kind==='companion')){const card=document.createElement('article');card.className='request-card';const title=document.createElement('strong'),status=document.createElement('p');title.textContent=`Для ${request.recipient_name} · ${request.degree} ед.`;status.textContent={pending:'Ожидание согласования на выдачу «Мистериума»',approved:'Выдача «Мистериума» согласована, и препарат доступен к получению',rejected:'Выдача «Мистериума» не согласована',issued:'Препарат получен'}[request.status]||request.status;card.append(title,status);
    if(request.status==='pending'){const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='Ожидайте';button.addEventListener('click',()=>showWaiting(request.id));card.append(button);}
    if(request.status==='approved'){const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='Получить препарат';button.addEventListener('click',async()=>{if(busy)return;busy=true;button.disabled=true;play('click');try{const data=await api('collect',{id:request.id});sync(data);degree=data.receipt.degree;$('companion-panel').hidden=true;setTab('dispense');await animateOpen();showReceipt(data.receipt);play('confirm');}catch(error){showError(error.message);button.disabled=false;}finally{busy=false;}});card.append(button);}list.append(card);
  }
  updateWaiting();
}
setInterval(async()=>{if(!real||busy||document.hidden||!requests.some(item=>item.status==='pending'||item.status==='approved'))return;try{sync(await api('state'));}catch{}},10000);
async function loadSprites(){
  await Promise.all(Object.entries({case:'box-cut.png',opening:'boxOpening-cut.png',robot:'robotSprite-cut.png',floor:'floor-cut.png',vial:'mysterium.webp'}).map(([key,file])=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{sprites[key]=img;resolve();};img.onerror=()=>reject(new Error('Не удалось загрузить интерфейс робота; пожалуйста, откройте его заново.'));img.src=`/assets/${file}`;})));
  drawScene();
}
async function start(){
  updateSound();renderFaq(fallbackFaq);renderHistory();
  try{tg?.ready();tg?.expand();tg?.setHeaderColor('#141914');tg?.setBackgroundColor('#141914');if(tg?.isVersionAtLeast?.('7.10'))tg.setBottomBarColor('#141914');}catch{}
  try{await loadSprites();}catch(e){showError(e.message);}
  try{accessCatalog=await(await fetch('/accesses.json')).json();renderAccesses();}catch{showError('Не удалось загрузить список служб; пожалуйста, откройте робота заново.');}
  if(real){
    try{
      const data=await api('state');sync(data);$('connection-label').textContent=`На связи · ${profile.character||profile.name}`;
      const receiptId=new URLSearchParams(location.search).get('receipt');
      const receipt=events.find(e=>e.id===receiptId&&e.kind==='dispense');
      if(receipt){degree=receipt.payload.degree;await animateOpen();showReceipt({...receipt.payload,id:receipt.id});}
    }catch(e){$('connection-label').textContent='Нет связи с контроллером';showError(e.message);}
  }else{
    $('connection-label').textContent='Просмотр робота';$('demo-notice').hidden=false;
    $('profile-form').querySelector('button').disabled=true;
    $('registration-form').querySelector('button').disabled=true;
  }
}
start();
