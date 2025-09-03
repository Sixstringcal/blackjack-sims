// Worker: runs simulations off the main thread
let running = true;

function randInt(n){return Math.floor(Math.random()*n)}

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
    [cards[i],cards[j]] = [cards[j],cards[i]];
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
  let consecutiveWins = 0;
  let runningCount = 0;

  // per-hand counters
  let handsWon = 0, handsLost = 0, pushes = 0, blackjacks = 0, totalHands = 0;

  const hiLoValue = (c)=>{ if(c>=2 && c<=6) return 1; if(c>=7 && c<=9) return 0; return -1 };

  for(let h=0; h<opts.handsPerSim; h++){
    if(!running) break;
    if(pos > shoe.length - 10 || pos >= shoe.length - cutCard){ shoe = makeShoe(opts.decks); pos=0; runningCount=0; consecutiveLosses=0; consecutiveWins=0; }

    if(opts.betSystem === 'flat'){
      bet = opts.minBet;
    } else if(opts.betSystem === 'martingale'){
      bet = consecutiveLosses===0 ? opts.minBet : Math.min(opts.minBet * Math.pow(2, consecutiveLosses), opts.tableLimit);
    } else if(opts.betSystem === 'triple-martingale'){
      bet = consecutiveLosses===0 ? opts.minBet : Math.min(opts.minBet * Math.pow(3, consecutiveLosses), opts.tableLimit);
    } else if(opts.betSystem === 'reverse-martingale'){
      bet = Math.min(opts.tableLimit, opts.minBet * Math.pow(2, Math.max(0, consecutiveWins)));
    } else if(opts.betSystem === 'proportional'){
      bet = Math.max(opts.minBet, Math.floor(bankroll * (opts.propPct/100)));
    } else if(opts.betSystem === 'kelly'){
      const edge = 0.01; const f = Math.max(0, edge); bet = Math.max(opts.minBet, Math.floor(bankroll * Math.min(f*opts.kellyFrac,1)));
    } else if(opts.betSystem === 'count-based'){
      let trueCount = runningCount;
      if(opts.useTrueCount){ const decksLeft = Math.max(0.1, (shoe.length-pos)/52); trueCount = runningCount / decksLeft; }
      const tcInt = Math.floor(trueCount);
      const mult = Math.max(1, Math.min(opts.countMult, 1 + tcInt));
      bet = Math.min(opts.tableLimit, Math.max(opts.minBet, Math.floor(opts.minBet * mult)));
    }

    bet = Math.max(opts.minBet, Math.min(bet, opts.tableLimit));
    if(bet > bankroll) bet = bankroll;

    const player = [shoe[pos++], shoe[pos++]];
    const dealerUp = shoe[pos++];
    const dealerHole = shoe[pos++];

    if(opts.enableCount){ runningCount += hiLoValue(player[0]) + hiLoValue(player[1]) + hiLoValue(dealerUp); }

    let playerHand = player.slice();
    while(basicStrategy(playerHand, dealerUp) === 'hit'){
      playerHand.push(shoe[pos++]);
      if(opts.enableCount) runningCount += hiLoValue(playerHand[playerHand.length-1]);
      if(handValue(playerHand) > 21) break;
    }

    if(opts.enableCount) runningCount += hiLoValue(dealerHole);

    const dealerHand = [dealerUp, dealerHole];
    while(true){
      const dv = handValue(dealerHand);
      if(dv>21) break;
      if(dv>17) break;
      if(dv===17){ const hasAce = dealerHand.includes(11); if(hasAce && opts.ds17) { } else break; }
      dealerHand.push(shoe[pos++]);
      if(opts.enableCount) runningCount += hiLoValue(dealerHand[dealerHand.length-1]);
    }

    const playerVal = handValue(playerHand);
    const dealerVal = handValue(dealerHand);

    let outcome = 0;
    const playerBJ = (player.length===2 && ((player[0]===11 && player[1]===10) || (player[1]===11 && player[0]===10)));
    const dealerBJ = ((dealerUp===11 && dealerHole===10) || (dealerHole===11 && dealerUp===10));
    if(playerBJ && !dealerBJ){ outcome = opts.payout; }
    else if(playerVal>21) outcome = -1;
    else if(dealerVal>21) outcome = 1;
    else if(playerVal > dealerVal) outcome = 1;
    else if(playerVal < dealerVal) outcome = -1;
    else outcome = 0;

    // per-hand tracking
    totalHands++;
    if(playerBJ && !dealerBJ) blackjacks++;
    if(outcome > 0) handsWon++;
    else if(outcome < 0) handsLost++;
    else pushes++;

    const winAmount = bet * outcome;
    bankroll += winAmount;

    if(outcome < 0){ consecutiveLosses++; consecutiveWins = 0; } else if(outcome>0){ consecutiveWins++; consecutiveLosses = 0; } else { consecutiveWins = 0; consecutiveLosses = 0; }

    if(bankroll <= 0) { bankroll = 0; break; }
    if(opts.maxLoss > 0 && (opts.bankroll - bankroll) >= opts.maxLoss) break;
  }

  return { finalBankroll: bankroll, handsWon, handsLost, pushes, blackjacks, totalHands };
}

onmessage = function(ev){
  const msg = ev.data;
  if(msg.type === 'start'){
    running = true;
    const opts = msg.opts;
    const results = [];
    const sims = opts.sims;
    for(let i=0;i<sims;i++){
      if(!running) break;
      if(i%10===0) postMessage({type:'progress', text:`Running sim ${i+1}/${sims}`});
      const simRes = simulateOne(opts);
      results.push(simRes);
    }

    const simCount = results.length;
    const avg = results.reduce((a,b)=>a + b.finalBankroll,0)/Math.max(1,simCount);
    const profitable = results.filter(r=>r.finalBankroll>opts.bankroll).length;

    const totalHands = results.reduce((a,b)=>a + b.totalHands,0);
    const totalWins = results.reduce((a,b)=>a + b.handsWon,0);
    const totalLosses = results.reduce((a,b)=>a + b.handsLost,0);
    const totalPushes = results.reduce((a,b)=>a + b.pushes,0);
    const totalBJs = results.reduce((a,b)=>a + b.blackjacks,0);

    const ev = avg - opts.bankroll;
    postMessage({type:'result', data:{
      avgFinalBankroll:avg,
      ev,
      profitableSimRate: profitable/Math.max(1,simCount),
      perHand: { totalHands, wins: totalWins, losses: totalLosses, pushes: totalPushes, blackjacks: totalBJs },
      raw: results
    }});
  } else if(msg.type === 'stop'){
    running = false;
  }
}

