import pkg from "enquirer";
const { Select } = pkg;
import { searchCode, openFile } from "./core.js";
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
    console.log(chalk.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

    const choices = results.map((r, i) => {
      const fileName = chalk.green(path.basename(r.filePath));
      const lineInfo = chalk.dim(`:${r.startLine}`);
      const typeInfo = chalk.blue(`[${r.type}]`);
      const scoreInfo = chalk.dim(`(${r.rerankScore.toFixed(2)})`);
      const symbolName = chalk.bold(r.name);
      const projectContext = chalk.magenta(`@${r.collection}/${r.projectName}`);

      // Create a nice preview hint
      let preview = "";
      if (r.summary) {
        preview = chalk.italic(r.summary.substring(0, 100));
      } else {
        preview = chalk.dim(r.content.substring(0, 100).replace(/\n/g, " "));
      }

      return {
        name: String(i),
        message: `${fileName}${lineInfo} ${symbolName} ${typeInfo} ${projectContext}`,
        hint: `\n    ${preview} ${scoreInfo}`
      };
    });

    choices.push({ name: "exit", message: chalk.red("Exit"), hint: "" });

    const prompt = new Select({
      name: "result",
      message: "Select a result to open in your editor:",
      choices,
      // Increase visible choices
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