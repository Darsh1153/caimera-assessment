function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

export function generateQuestion(difficulty = 1) {
  const ops = ["+", "-", "*"];
  const op = pick(ops);

  const scale = Math.min(50 + difficulty * 25, 500);
  let a = randInt(1, scale);
  let b = randInt(1, scale);

  if (op === "-") {
    if (b > a) [a, b] = [b, a];
  }

  let expr = `${a} ${op} ${b}`;
  let answer;
  if (op === "+") answer = a + b;
  if (op === "-") answer = a - b;
  if (op === "*") answer = a * b;

  if (difficulty >= 3) {
    const op2 = pick(ops);
    let c = randInt(1, Math.min(scale, 200));
    if (op2 === "-") {
      c = randInt(1, Math.min(scale, 200));
    }
    const safeOp2 = op2 === "-" ? "+" : op2;
    expr = `(${expr}) ${safeOp2} ${c}`;
    if (safeOp2 === "+") answer = answer + c;
    if (safeOp2 === "*") answer = answer * c;
  }

  return {
    prompt: expr,
    answer: String(answer)
  };
}

