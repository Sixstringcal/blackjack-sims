// Main UI glue - single-file simulator (no Worker). Runs sims in small async batches to keep UI responsive.
const qs = id => document.getElementById(id);

function clampNumber(input, min, max){
  const v = Number(input);
  if(Number.isNaN(v)) return min;
  if(min !== undefined && v < min) return min;
  if(max !== undefined && v > max) return max;
  return v;
}

function readOptions(){
  return {
    decks: clampNumber(qs('decks').value,1,8),
    ds17: qs('ds17').value === 'true',
    payout: Number(qs('payout').value),
    penetration: clampNumber(qs('penetration').value,5,100),
    minBet: clampNumber(qs('minBet').value,1),
    startBet: clampNumber(qs('startBet').value,1),
    tableLimit: clampNumber(qs('tableLimit').value,1),
    bankroll: clampNumber(qs('bankroll').value,0),
    maxLoss: clampNumber(qs('maxLoss').value,0),
    handsPerSim: clampNumber(qs('handsPerSim').value,1),
    sims: clampNumber(qs('sims').value,1),
    betSystem: qs('betSystem').value,
    propPct: clampNumber(qs('propPct').value,0,100),
    kellyFrac: clampNumber(qs('kellyFrac').value,0,1),
    countMult: clampNumber(qs('countMult').value,1),
    resetOnWin: qs('resetOnWin').checked,
    resetAfterLosses: clampNumber(qs('resetAfterLosses').value,0),
    enableCount: qs('enableCount').checked,
    useTrueCount: qs('useTrueCount').checked
  };
}

// RNG
function randInt(n){ return Math.floor(Math.random()*n); }

function makeShoe(decks){
  const cards = [];
  const faces = [2,3,4,5,6,7,8,9,10,10,10,10,11];
  for(let d=0; d<decks; d++){
    for(const v of faces){
      for(let i=0;i<4;i++) cards.push(v);
    }
  }
  for(let i=cards.length-1;i>0;i--){
    const j = randInt(i+1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function handValue(cards){
  let sum = 0, aces = 0;
  for(const c of cards){ if(c===11){ aces++; sum+=11 } else sum+=c }
  while(sum>21 && aces>0){ sum-=10; aces--; }
  return sum;
}

function basicStrategy(playerHand, dealerUp){
  const v = handValue(playerHand);
  if(v>=17) return 'stand';
  if(v<=11) return 'hit';
  if(v>=12 && v<=16){ if(dealerUp>=2 && dealerUp<=6) return 'stand'; else return 'hit'; }
  return 'stand';
}

function simulateOne(opts){
  let shoe = makeShoe(opts.decks);
  let cutCard = Math.floor(shoe.length * (opts.penetration/100));
  let pos = 0;
  let bankroll = opts.bankroll;
  let bet = opts.startBet;
  let consecutiveLosses = 0;
  let runningCount = 0;

  const hiLoValue = (c)=>{ if(c>=2 && c<=6) return 1; if(c>=7 && c<=9) return 0; return -1 };

  for(let h=0; h<opts.handsPerSim; h++){
    if(pos > shoe.length - 10 || pos >= shoe.length - cutCard){ shoe = makeShoe(opts.decks); pos=0; runningCount=0; }

    // betting systems
    if(opts.betSystem === 'flat'){
      bet = opts.minBet;
    } else if(opts.betSystem === 'martingale'){
      bet = consecutiveLosses===0 ? opts.minBet : Math.min(opts.minBet * Math.pow(2, consecutiveLosses), opts.tableLimit);
    } else if(opts.betSystem === 'triple-martingale'){
      bet = consecutiveLosses===0 ? opts.minBet : Math.min(opts.minBet * Math.pow(3, consecutiveLosses), opts.tableLimit);
    } else if(opts.betSystem === 'reverse-martingale'){
      bet = Math.min(opts.minBet * Math.pow(2, Math.max(0, -consecutiveLosses)), opts.tableLimit);
    } else if(opts.betSystem === 'proportional'){
      bet = Math.max(opts.minBet, Math.floor(bankroll * (opts.propPct/100)));
    } else if(opts.betSystem === 'kelly'){
      const edge = 0.01; const f = Math.max(0, edge); bet = Math.max(opts.minBet, Math.floor(bankroll * Math.min(f*opts.kellyFrac,1)));
    } else if(opts.betSystem === 'count-based'){
      let trueCount = runningCount;
      if(opts.useTrueCount){ const decksLeft = Math.max(1, Math.round((shoe.length-pos)/(52))); trueCount = Math.round(runningCount / decksLeft); }
      const mult = Math.max(1, Math.min(opts.countMult, 1 + trueCount));
      bet = Math.min(opts.tableLimit, Math.max(opts.minBet, Math.floor(opts.minBet * mult)));
    }

    bet = Math.max(opts.minBet, Math.min(bet, opts.tableLimit));
    if(bet > bankroll) bet = bankroll;

    const player = [shoe[pos++], shoe[pos++]];
    const dealerUp = shoe[pos++];
    const dealerHole = shoe[pos++];
    if(opts.enableCount){ runningCount += hiLoValue(player[0]) + hiLoValue(player[1]) + hiLoValue(dealerUp) + hiLoValue(dealerHole); }

    let playerHand = player.slice();
    while(basicStrategy(playerHand, dealerUp) === 'hit'){
      playerHand.push(shoe[pos++]);
      if(opts.enableCount) runningCount += hiLoValue(playerHand[playerHand.length-1]);
      if(handValue(playerHand) > 21) break;
    }

    const dealerHand = [dealerUp, dealerHole];
    while(true){
      const dv = handValue(dealerHand);
      if(dv>21) break;
      if(dv>17) break;
      const hasAce = dealerHand.includes(11);
      if(dv===17 && hasAce && opts.ds17){ /* hit soft 17 */ } else if(dv===17) break;
      dealerHand.push(shoe[pos++]);
      if(opts.enableCount) runningCount += hiLoValue(dealerHand[dealerHand.length-1]);
    }

    const playerVal = handValue(playerHand);
    const dealerVal = handValue(dealerHand);
    const playerBJ = (player.length===2 && ((player[0]===11 && player[1]===10) || (player[1]===11 && player[0]===10)));
    const dealerBJ = ((dealerUp===11 && dealerHole===10) || (dealerHole===11 && dealerUp===10));

    let outcome = 0;
    if(playerBJ && !dealerBJ) outcome = opts.payout;
    else if(playerVal>21) outcome = -1;
    else if(dealerVal>21) outcome = 1;
    else if(playerVal > dealerVal) outcome = 1;
    else if(playerVal < dealerVal) outcome = -1;
    else outcome = 0;

    const winAmount = bet * outcome;
    bankroll += winAmount;

    if(outcome < 0) consecutiveLosses++; else if(outcome>0) consecutiveLosses = 0;
    if(bankroll <= 0){ bankroll = 0; break; }
    if(opts.maxLoss > 0 && (opts.bankroll - bankroll) >= opts.maxLoss) break;
  }

  return bankroll;
}

// Async-run many simulations in small batches so UI stays responsive
let stopRequested = false;
async function runSimsAsync(opts, progressCb){
  stopRequested = false;
  const results = [];
  const batch = 8; // run sims in small synchronous batches then yield
  for(let i=0;i<opts.sims;i+=batch){
    if(stopRequested) break;
    const end = Math.min(i+batch, opts.sims);
    for(let j=i;j<end;j++){
      const r = simulateOne(opts);
      results.push(r);
    }
    if(progressCb) progressCb(Math.min(opts.sims, results.length), opts.sims);
    // yield to UI
    await new Promise(res => setTimeout(res, 0));
  }
  return results;
}

qs('start').addEventListener('click', async ()=>{
  const opts = readOptions();
  if(opts.minBet <= 0 || opts.startBet <= 0){ alert('Bets must be positive and non-zero'); return; }
  qs('start').disabled = true; qs('stop').disabled = false;
  qs('progress').textContent = 'Starting...'; qs('output').textContent = '';

  try{
    const results = await runSimsAsync(opts, (done, total)=>{
      qs('progress').textContent = `Running simulations: ${done}/${total}`;
    });

    const avg = results.reduce((a,b)=>a+b,0) / Math.max(1, results.length);
    const wins = results.filter(r=>r>opts.bankroll).length;
    const ev = avg - opts.bankroll;
    qs('output').textContent = JSON.stringify({avgFinalBankroll:avg, ev, winRate:wins/Math.max(1,results.length)}, null, 2);
    qs('progress').textContent = 'Done';
  }catch(e){
    qs('progress').textContent = 'Error';
    qs('output').textContent = String(e);
  } finally{
    qs('start').disabled = false; qs('stop').disabled = true;
  }
});

qs('stop').addEventListener('click', ()=>{
  stopRequested = true;
  qs('progress').textContent = 'Stopping...';
});
