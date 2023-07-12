const Diff = require('difflib');


import { simple_cleanup_cr_lf } from "./crlf";


export function getDiffAdditionsBlocks(state0: string, state1: string): [string, string] {
    state0 = simple_cleanup_cr_lf(state0);
    state1 = simple_cleanup_cr_lf(state1);
  
    let file1Lines: string[] = state0.split('\n');
    let file2Lines: string[] = state1.split('\n');

    const differ = new Diff.Differ();
    const diff = differ.compare(file1Lines, file2Lines);

    const diffBlocks: string[][] = [];
    let currentBlock: string[] = [];
    for (const part of diff) {
      if (part.startsWith('?')) {
        if (currentBlock.length > 0) {
          diffBlocks.push(currentBlock);
          currentBlock = [];
        }
      }
      else if (part.startsWith('+') || part.startsWith('-')) {
        currentBlock.push(part);
      }
      else {
        if (currentBlock.length > 0) {
          diffBlocks.push(currentBlock);
          currentBlock = [];
        }
        }
      }
      
    if (currentBlock.length > 0) {
      diffBlocks.push(currentBlock);
    }

    const diffText: string[] = diffBlocks.flatMap((b: string[]) => b);

    const additions: string = diffText.filter(l => l.startsWith('+')).map(l => l.slice(2)).join("\n");
    const deletions: string = diffText.filter(l => l.startsWith('-')).map(l => l.slice(2)).join("\n");

    return [additions, deletions];
}

export function find_most_similar_string(text: string, completion: string): [string | undefined, [number, number]] {
  text = simple_cleanup_cr_lf(text);
  let bestRatio: number = 0;
  let bestString: string | undefined = undefined;
  for (const line of text.split('\n')) {
    const s = new Diff.SequenceMatcher(null, line, completion);
    const ratio = s.ratio();
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestString = line;
    }
  }
  if (bestString) {
    let l_diff: string[] = Diff.ndiff(bestString, completion);
    let additions = l_diff.filter(l => l.startsWith('+')).map(l => l.slice(2)).filter(l => l.replace(/\s+/g, '') !== '');
    let deletions = l_diff.filter(l => l.startsWith('-')).map(l => l.slice(2)).filter(l => l.replace(/\s+/g, '') !== '');
    return [bestString, [additions.length, deletions.length]];
  }
  return [undefined, [0, 0]];
}

export function completionMetrics(text: string, completion: string): [number, [number, number]] {
    text = simple_cleanup_cr_lf(text);
    completion = simple_cleanup_cr_lf(completion);

    if (!completion.includes('\n')) {
      const [best_s, [add_c, del_c]] = find_most_similar_string(text, completion);
      if (!best_s) {
          return [0, [0, text.replace(/\s+/g, '').length]];
      }
      const best_s_c = (best_s.replace(/\s+/g, '')).length;
      const matched_c: number = best_s_c - del_c;
      const completion_c: number = (completion.replace(/\s+/g, '')).length;
      const human_c = (text.replace(/\s+/g, '')).length - matched_c;
      return [matched_c / completion_c, [matched_c, human_c]];
  }
    
    let [addText, delText] = getDiffAdditionsBlocks(text, completion);
    addText = addText.replace(/\s+/g, '');
    delText = delText.replace(/\s+/g, '');

    completion = completion.replace(/\s+/g, '');
    
    const usefulCompletion = completion.length - addText.length;
    const userTyped = delText.length;
  
    return [usefulCompletion / completion.length, [usefulCompletion, userTyped]];
  }
  
export function completionMetricPipeline(
    state0: string,
    state1: string, 
    completion0: string
    ) : [number, [number, number]] {
    const [additions, _] = getDiffAdditionsBlocks(state0, state1);
    let score = completionMetrics(additions, completion0);
    return score;
  }
