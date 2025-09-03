// Worker: runs simulations off the main thread
let running = true;

function randInt(n){return Math.floor(Math.random()*n)}

function makeShoe(decks){
  const cards = [];
  const faces = [2,3,4,5,6,7,8,9,10,10,10,10,11];
  for(let d=0; d<decks; d++){
    for(const v of faces){
      // 4 suits
      for(let i=0;i<4;i++) cards.push(v);
    }
  }
  // simple shuffle
  for(let i=cards.length-1;i>0;i--){
    const j = randInt(i+1);
    [cards[i],cards[j]] = [cards[j],cards[i]];
  }
  return cards;
}

function handValue(cards){
  let sum = 0; let aces=0;
  for(const c of cards){ if(c===11){aces++; sum+=11} else sum+=c }
  while(sum>21 && aces>0){ sum-=10; aces--; }
  return sum;
}

function dealerPlays(shoe, pos, ds17){
  const hand = [shoe[pos++], shoe[pos++]];
  while(true){
    const v = handValue(hand);
    if(v>21) break;
    if(v>17) break;
    if(v===17){
      // check soft
      const hasAce = hand.includes(11);
      if(hasAce && ds17){ /* hit soft 17 */ } else break;
    }
    hand.push(shoe[pos++]);
  }
  return {hand, pos};
}

function basicStrategy(playerHand, dealerUp, canDouble, canSplit){
  // Very simplified: hit under 12, stand 17+, else hit/stand rudimentary
  const v = handValue(playerHand);
  if(v>=17) return 'stand';
  if(v<=11) return 'hit';
  // simple: if 12-16 stand vs dealer 2-6 else hit
  if(v>=12 && v<=16){ if(dealerUp>=2 && dealerUp<=6) return 'stand'; else return 'hit'; }
  return 'stand';
}

function simulateOne(opts){
  // returns final bankroll after hands
  let shoe = makeShoe(opts.decks);
  let cutCard = Math.floor(shoe.length * (opts.penetration/100));
  let pos = 0;
  let bankroll = opts.bankroll;
  let bet = opts.startBet;
  let consecutiveLosses = 0;
  let runningCount = 0; // hi-lo: 2-6 +1, 7-9 0, 10,A -1

  const hiLoValue = (c)=>{ if(c>=2 && c<=6) return 1; if(c>=7 && c<=9) return 0; return -1 };

  for(let h=0; h<opts.handsPerSim; h++){
    if(!running) break;
    if(pos > shoe.length - 10 || pos >= shoe.length - cutCard){ shoe = makeShoe(opts.decks); pos=0; runningCount=0; }

    // adjust bet by system
    if(opts.betSystem === 'flat'){
      bet = opts.minBet;
    } else if(opts.betSystem === 'martingale'){
      if(consecutiveLosses===0) bet = opts.minBet; else bet = Math.min(opts.minBet * Math.pow(2, consecutiveLosses), opts.tableLimit);
    } else if(opts.betSystem === 'triple-martingale'){
      if(consecutiveLosses===0) bet = opts.minBet; else bet = Math.min(opts.minBet * Math.pow(3, consecutiveLosses), opts.tableLimit);
    } else if(opts.betSystem === 'reverse-martingale'){
      bet = Math.min(opts.minBet * Math.pow(2, Math.max(0, consecutiveLosses*-1)), opts.tableLimit);
    } else if(opts.betSystem === 'proportional'){
      bet = Math.max(opts.minBet, Math.floor(bankroll * (opts.propPct/100)));
    } else if(opts.betSystem === 'kelly'){
      // naive: assume edge 0.01
      const edge = 0.01; const p=0.5; const b=1; const f = Math.max(0, (edge/(b)) ); bet = Math.max(opts.minBet, Math.floor(bankroll * Math.min(f*opts.kellyFrac,1)));
    } else if(opts.betSystem === 'count-based'){
      let trueCount = runningCount;
      if(opts.useTrueCount){ const decksLeft = Math.max(1, Math.round((shoe.length-pos)/(52))); trueCount = Math.round(runningCount / decksLeft); }
      const mult = Math.max(1, Math.min(opts.countMult, 1 + trueCount));
      bet = Math.min(opts.tableLimit, Math.max(opts.minBet, Math.floor(opts.minBet * mult)));
    }

    bet = Math.max(opts.minBet, Math.min(bet, opts.tableLimit));
    if(bet > bankroll) bet = bankroll; // all-in

    // deal
    const player = [shoe[pos++], shoe[pos++]];
    const dealerUp = shoe[pos++];
    const dealerHole = shoe[pos++];
    // adjust counts
    if(opts.enableCount){ runningCount += hiLoValue(player[0]) + hiLoValue(player[1]) + hiLoValue(dealerUp) + hiLoValue(dealerHole); }

    // player play simplistic
    let playerHand = player.slice();
    let action;
    while((action = basicStrategy(playerHand, dealerUp, true, false)) === 'hit'){
      playerHand.push(shoe[pos++]);
      if(opts.enableCount) runningCount += hiLoValue(playerHand[playerHand.length-1]);
      if(handValue(playerHand) > 21) break;
    }

    // dealer plays from shoe - we have to reconstruct pos for dealer: we already consumed 4 cards + any player hits
    // In this simplified model, dealer's hole card already taken; continue from pos
    // evaluate
    const playerVal = handValue(playerHand);
    // dealer cards: dealerUp + dealerHole + hits
    const dealerHand = [dealerUp, dealerHole];
    while(true){
      const dv = handValue(dealerHand);
      if(dv>21) break;
      if(dv>17) break;
      if(dv===17){ const hasAce = dealerHand.includes(11); if(hasAce && opts.ds17) { /* hit */ } else break; }
      dealerHand.push(shoe[pos++]);
      if(opts.enableCount) runningCount += hiLoValue(dealerHand[dealerHand.length-1]);
    }
    const dealerVal = handValue(dealerHand);

    // payout
    let outcome = 0; // -1 lose, 0 push, 1 win, 1.5 blackjack
    // detect blackjack
    const playerBJ = (player.length===2 && ((player[0]===11 && player[1]===10) || (player[1]===11 && player[0]===10)));
    const dealerBJ = ((dealerUp===11 && dealerHole===10) || (dealerHole===11 && dealerUp===10));
    if(playerBJ && !dealerBJ){ outcome = opts.payout; }
    else if(playerVal>21) outcome = -1;
    else if(dealerVal>21) outcome = 1;
    else if(playerVal > dealerVal) outcome = 1;
    else if(playerVal < dealerVal) outcome = -1;
    else outcome = 0;

    // apply bankroll change
    const winAmount = bet * outcome;
    bankroll += winAmount;

    if(outcome < 0){ consecutiveLosses++; } else if(outcome>0){ consecutiveLosses = 0; }

    // stop conditions
    if(bankroll <= 0) { bankroll = 0; break; }
    if(opts.maxLoss > 0 && (opts.bankroll - bankroll) >= opts.maxLoss) break;
  }

  return bankroll;
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
      const endBankroll = simulateOne(opts);
      results.push(endBankroll);
    }
    // compute stats
    const avg = results.reduce((a,b)=>a+b,0)/results.length;
    const wins = results.filter(r=>r>opts.bankroll).length;
    const ev = avg - opts.bankroll;
    postMessage({type:'result', data:{avgFinalBankroll:avg, ev, winRate:wins/results.length, raw:results}});
  } else if(msg.type === 'stop'){
    running = false;
  }
}
