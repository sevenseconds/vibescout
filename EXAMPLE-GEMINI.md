# VibeScout Context (Gemini)

This project is indexed via VibeScout running in a Docker container.

- **Root Path**: All projects are mounted under `/projects`.
- **Indexing**: To index this specific project, use the tool `index_folder` with the path `/projects/` followed by the folder name of this repository.
- **Search**: When searching, you are querying the LanceDB vector store located inside the container.
