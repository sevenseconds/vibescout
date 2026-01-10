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
    
    // Calculate column widths
    const cols = {
      file: Math.max(...results.map(r => path.basename(r.filePath).length), 10),
      line: Math.max(...results.map(r => String(r.startLine).length), 4),
      name: Math.max(...results.map(r => r.name.length), 15),
      type: Math.max(...results.map(r => r.type.length), 8),
      project: Math.max(...results.map(r => `${r.collection}/${r.projectName}`.length), 15)
    };

    // Limit max widths to avoid overflow
    cols.file = Math.min(cols.file, 25);
    cols.name = Math.min(cols.name, 30);
    cols.project = Math.min(cols.project, 30);

    const header = 
      chalk.bold.underline(
        "  " +
        "Context".padEnd(cols.project) + "  " +
        "File".padEnd(cols.file) + "  " +
        "Line".padEnd(cols.line) + "  " +
        "Symbol".padEnd(cols.name) + "  " +
        "Type"
      );
    
    console.log(`\n${header}`);

    const choices = results.map((r, i) => {
      const projectContext = `${r.collection}/${r.projectName}`.substring(0, cols.project).padEnd(cols.project);
      const fileName = path.basename(r.filePath).substring(0, cols.file).padEnd(cols.file);
      const lineInfo = String(r.startLine).padEnd(cols.line);
      const symbolName = r.name.substring(0, cols.name).padEnd(cols.name);
      const typeInfo = r.type;

      // Create a nice preview hint
      let preview = "";
      if (r.summary) {
        preview = chalk.italic(r.summary.substring(0, 100));
      } else {
        preview = chalk.dim(r.content.substring(0, 100).replace(/\n/g, " "));
      }

      return {
        name: String(i),
        message: 
          chalk.magenta(projectContext) + "  " +
          chalk.green(fileName) + "  " +
          chalk.dim(lineInfo) + "  " +
          chalk.bold(symbolName) + "  " +
          chalk.blue(typeInfo),
        hint: `\n      ${preview} ${chalk.dim(`(${r.rerankScore.toFixed(2)})`)}`
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