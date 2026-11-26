const arenaPanel = {
  status: $('arena-status'), character: $('arena-character'),
  options: $('arena-options'), items: $('arena-items'),
  confirm: $('arena-confirm'), refresh: $('arena-refresh')
};
let arenaData = null;
let arenaSelection = null;
let arenaBusy = false;

function arenaElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function arenaCard({id, name, description, damage}) {
  const card = arenaElement('article', null, 'arena-item');
  const img = arenaElement('img');
  img.src = id === 'sickle' ? '/assets/arena/sickle-handheld.png' : '/assets/arena/' + id + '.webp';
  img.alt = '';
  const content = arenaElement('div');
  content.append(arenaElement('h2', name));
  if (damage) content.append(arenaElement('p', 'Урон: ' + damage, 'arena-damage'));
  content.append(arenaElement('p', description));
  card.append(img, content);
  return card;
}

const arenaBackpack = {
  id: 'backpack',
  name: 'Рюкзак',
  description: 'Фляга очищенной воды, два сухпайка, перевязочный пакет и карманный фонарь. В каждом сухпайке мясные консервы, галеты и сушёные яблоки.'
};

function renderArena() {
  const {status,character,options,items,confirm} = arenaPanel;
  character.textContent = arenaData ? [arenaData.character, arenaData.roll && 'D20: ' + arenaData.roll].filter(Boolean).join(' · ') : '';
  options.replaceChildren();
  items.replaceChildren();
  confirm.hidden = true;
  if (!arenaData) return;
  const {chosen,closed,manualChoice,roll} = arenaData;
  if (chosen) status.textContent = 'Выбор подтверждён: ' + chosen.label + '.';
  else if (closed) status.textContent = 'Выбор снаряжения закрыт.';
  else if (manualChoice) status.textContent = 'Снаряжение уже отмечено в таблице стаффом.';
  else if (!roll) status.textContent = 'Стафф ещё не внёс Ваш стартовый D20.';
  else status.textContent = 'Выберите один вариант, затем подтвердите.';

  const choices = arenaData.options;
  for (const kit of choices) {
    const button = arenaElement('button', kit.label, 'secondary-button');
    button.type = 'button';
    button.disabled = arenaBusy;
    button.setAttribute('aria-pressed', String(arenaSelection?.id === kit.id));
    button.addEventListener('click', () => { arenaSelection = kit; renderArena(); });
    options.append(button);
  }

  const preview = chosen ? [chosen] : arenaSelection ? [arenaSelection] : choices;
  if (preview.some(kit => kit.backpack)) items.append(arenaCard(arenaBackpack));
  const weapons = new Map(preview.filter(kit => kit.weapon).map(kit => [kit.weapon.id, kit.weapon]));
  for (const weapon of weapons.values()) items.append(arenaCard(weapon));
  confirm.hidden = !arenaSelection || !!chosen;
  confirm.disabled = arenaBusy;
}

async function loadArena() {
  if (arenaBusy) return;
  arenaBusy = true;
  arenaPanel.refresh.disabled = true;
  arenaData = null;
  arenaSelection = null;
  renderArena();
  arenaPanel.status.textContent = 'Проверяю стартовый бросок…';
  try {
    arenaData = await api('arena');
  } catch (error) {
    arenaPanel.status.textContent = error.message;
  } finally {
    arenaBusy = false;
    arenaPanel.refresh.disabled = false;
    renderArena();
  }
}

async function confirmArena() {
  if (arenaBusy || !arenaSelection || !arenaData?.roll || arenaData.chosen) return;
  arenaBusy = true;
  arenaPanel.refresh.disabled = true;
  renderArena();
  arenaPanel.status.textContent = 'Записываю снаряжение в инвентарь…';
  let failure = '';
  try {
    arenaData = await api('arena-confirm', {choice: arenaSelection.id, roll: arenaData.roll});
    arenaSelection = null;
    play('confirm');
  } catch (error) {
    failure = error.message;
  } finally {
    arenaBusy = false;
    arenaPanel.refresh.disabled = false;
    renderArena();
    if (failure) arenaPanel.status.textContent = failure;
  }
}
arenaPanel.refresh.addEventListener('click', loadArena);
arenaPanel.confirm.addEventListener('click', confirmArena);

if (new URLSearchParams(location.search).get('view') === 'arena') setTab('arena');
