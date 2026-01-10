import pkg from "enquirer";
const { Select } = pkg;
import { searchCode, openFile } from "./core.js";
import path from "path";

export async function interactiveSearch(query, collection, projectName) {
  const results = await searchCode(query, collection, projectName);

  if (results.length === 0) {
    console.log("No matches found.");
    return;
  }

  async function showResults() {
    const choices = results.map((r, i) => ({
      name: String(i),
      message: `${path.basename(r.filePath)}:${r.startLine} - ${r.name} [Score: ${r.rerankScore.toFixed(2)}]`,
      hint: r.summary ? r.summary.substring(0, 50) + "..." : ""
    }));

    choices.push({ name: "exit", message: "Exit", hint: "" });

    const prompt = new Select({
      name: "result",
      message: `Search results for "${query}" (Select to open):`,
      choices
    });

    try {
      const answer = await prompt.run();
      if (answer === "exit") return;

      const selected = results[parseInt(answer)];
      console.log(`\nOpening ${selected.filePath}:${selected.startLine}...`);
      await openFile(selected.filePath, selected.startLine);
      
      // Return to list after opening? Or exit?
      // Usually users want to return to list.
      return showResults();
    } catch (err) {
      // Cancelled
    }
  }

  await showResults();
}
