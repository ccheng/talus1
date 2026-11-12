const firstQuestionNumbers = [1, 2, 4, 12, 13];
const answerChoice = /^([A-D])\.(?:\s|$)/;
const questionNumber = /^(\d+)\.\s/;
const responseRule = /^_{4,}$/;
const responseLabel = /^Question \d+\s+—\s+response space/;
const labContinuation = /^Question 12\b.*\bcontinu(?:ed|ation)\b/i;

export function auditRenderedPages(raw: string, key: boolean) {
  const pages = raw.split('\f').map(page => page.split('\n').map(line => line.trim()).filter(Boolean))
    .filter(page => page.length > 0);
  const headings = new Map<number, number>();
  const questions = new Map<number, number>();
  const choices = new Map<number, {letter: string; page: number}[]>();
  const layoutIssues: string[] = [];
  const labIssues: string[] = [];
  let currentQuestion = 0;
  let ruleCount = 0;

  for (const [index, lines] of pages.entries()) {
    const page = index + 1;
    const body = lines.filter(line => !/^Talus Rich Content Acceptance\s*\|/.test(line) && !/^Page \d+$/.test(line));
    const firstRule = body.findIndex(line => responseRule.test(line));
    if (firstRule !== -1 && !body.slice(0, firstRule).some(line => responseLabel.test(line))) {
      layoutIssues.push(`page ${page}: writing lines begin without a question-number response label`);
    }
    for (const line of body) {
      const heading = line.match(/^Section (\d+):/);
      if (heading) headings.set(Number(heading[1]), page);
      const question = line.match(questionNumber);
      if (question) {
        currentQuestion = Number(question[1]);
        questions.set(currentQuestion, page);
      }
      const choice = line.match(answerChoice);
      if (choice) {
        const group = choices.get(currentQuestion) ?? [];
        group.push({letter: choice[1], page});
        choices.set(currentQuestion, group);
      }
      if (responseRule.test(line)) ruleCount++;
    }
  }

  if (questions.size !== 13) layoutIssues.push(`expected 13 numbered questions, got ${questions.size}`);
  for (const [i, q] of firstQuestionNumbers.entries()) {
    const headingPage = headings.get(i + 1);
    if (!headingPage || headingPage !== questions.get(q)) {
      layoutIssues.push(`Section ${i + 1}: heading on page ${headingPage}, Q${q} on page ${questions.get(q)}`);
    }
  }
  if (choices.size !== 3) layoutIssues.push(`expected three multiple-choice groups, got ${choices.size}`);
  for (const [q, group] of choices) {
    if (group.map(choice => choice.letter).join('') !== 'ABCD' ||
        group.some(choice => choice.page !== questions.get(q))) {
      layoutIssues.push(`Q${q}: prompt page ${questions.get(q)}, options ${group.map(c => c.letter + '@' + c.page).join(', ')}`);
    }
  }
  const calibrationPage = pages.findIndex(lines => lines.some(line => line.includes('Calibration grid')));
  if (calibrationPage < 0 || !['Run group', 'Notes', 'Series V', '14.250', 'H2O ratio'].every(marker =>
    pages[calibrationPage].some(line => line.includes(marker)))) {
    layoutIssues.push('Calibration prompt, header and data rows do not share a page');
  }
  const expectedRules = key ? 0 : 74;
  if (ruleCount !== expectedRules) layoutIssues.push(`expected ${expectedRules} writing lines, got ${ruleCount}`);

  const labPage = questions.get(12);
  const markers = ['Time (s)', 'MIX-END E12B', ...(key ? ['Answer: 4 m/s.'] : [])];
  for (const marker of markers) {
    const index = pages.findIndex(lines => lines.some(line => line.includes(marker)));
    if (!labPage || index === -1) {
      layoutIssues.push(`missing Lab prompt or ${marker}`);
      continue;
    }
    const lines = pages[index];
    const position = lines.findIndex(line => line.includes(marker));
    if (index + 1 !== labPage && !lines.slice(0, position).some(line => labContinuation.test(line))) {
      labIssues.push(`${marker} on page ${index + 1} has no Q12 continuation cue before it (prompt on page ${labPage})`);
    }
  }

  return {layoutIssues, labIssues, pages: pages.length};
}
