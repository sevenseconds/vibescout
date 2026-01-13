import pkg from "enquirer";
const { Select } = pkg;
import { searchCode, openFile } from "../../common/src/core.js";
import path from "path";
import chalk from "chalk";

export async function interactiveSearch(query, collection, projectName) {
  const results = await searchCode(query, collection, projectName);

  if (results.length === 0) {
    console.log(chalk.yellow("\nNo matches found."));
    return;
  }

  async function showResults() {
    console.clear();
    console.log(chalk.cyan(`\nSearch results for: "${chalk.bold(query)}"`));
    
    // Calculate column widths
    const cols = {
      project: Math.max(...results.map(r => `${r.collection}/${r.projectName}`.length), 15),
      file: Math.max(...results.map(r => path.basename(r.filePath).length), 10),
      symbol: Math.max(...results.map(r => `${r.type}:${r.name}`.length), 20)
    };

    // Limit max widths to avoid overflow
    cols.project = Math.min(cols.project, 20);
    cols.file = Math.min(cols.file, 20);
    cols.symbol = Math.min(cols.symbol, 30);
    const summaryWidth = 50;

    const header = 
      chalk.bold.underline(
        "  " +
        "Context".padEnd(cols.project) + "  " +
        "File".padEnd(cols.file) + "  " +
        "Symbol".padEnd(cols.symbol) + "  " +
        "Summary"
      );
    
    console.log(`\n${header}`);

    const choices = results.map((r, i) => {
      const projectContext = `${r.collection}/${r.projectName}`.substring(0, cols.project).padEnd(cols.project);
      const fileName = path.basename(r.filePath).substring(0, cols.file).padEnd(cols.file);
      const symbolInfo = `${r.type}:${r.name}`.substring(0, cols.symbol).padEnd(cols.symbol);
      
      // Truncated summary for the column
      const summaryText = (r.summary || r.content.replace(/\n/g, " "))
        .substring(0, summaryWidth)
        .padEnd(summaryWidth);

      return {
        name: String(i),
        message: 
          chalk.magenta(projectContext) + "  " +
          chalk.green(fileName) + "  " +
          chalk.bold(symbolInfo) + "  " +
          chalk.italic.dim(summaryText),
        hint: `\n      ${chalk.cyan("Score:")} ${chalk.dim(r.rerankScore.toFixed(4))} ${chalk.dim(`(Line ${r.startLine})`)}`
      };
    });

    choices.push({ name: "exit", message: chalk.red("Exit"), hint: "" });

    const prompt = new Select({
      name: "result",
      message: "Select a result to open:",
      choices,
      limit: 10
    });

    try {
      const answer = await prompt.run();
      if (answer === "exit") return;

      const selected = results[parseInt(answer)];
      console.log(chalk.cyan(`\nOpening ${chalk.bold(selected.filePath)}...`));
      await openFile(selected.filePath, selected.startLine);
      
      // Prompt to continue or exit
      const nextAction = new Select({
        name: "next",
        message: "What's next?",
        choices: [
          { name: "back", message: "Back to results" },
          { name: "exit", message: "Exit" }
        ]
      });

      const next = await nextAction.run();
      if (next === "back") return showResults();
    } catch {
      // Cancelled
    }
  }

  await showResults();
}