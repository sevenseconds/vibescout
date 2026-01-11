export const XmlStrategy = {
  extensions: [".xml", ".html", ".svg"],
  
  extract: async (code, filePath) => {
    const lines = code.split("\n");
    const blocks = [];
    const metadata = { imports: [], exports: [] };

    // Regex-based extraction for XML (Simple Tag identification)
    const tagRegex = /<([a-zA-Z0-9:-]+)[^>]*>/g;
    
    // We'll extract larger chunks if they contain significant content
    // or specifically important tags (e.g. <component>, <item>)
    let match;
    const seenTags = new Set();

    while ((match = tagRegex.exec(code)) !== null) {
      const tagName = match[1];
      if (tagName.startsWith("/") || tagName.startsWith("?")) continue;
      
      // Only extract unique significant tags as blocks to avoid noise
      if (!seenTags.has(tagName) && seenTags.size < 20) {
        seenTags.add(tagName);
        const index = match.index;
        const line = code.substring(0, index).split("\n").length;
        
        blocks.push({
          name: `<${tagName}>`,
          type: "tag",
          category: "documentation",
          startLine: line,
          endLine: line,
          comments: "",
          content: match[0],
          filePath
        });
      }
    }

    // Always include root block
    blocks.push({
      name: "xml_root",
      type: "file",
      category: "documentation",
      startLine: 1,
      endLine: lines.length,
      comments: "",
      content: code.substring(0, 5000), // Cap content for very large XMLs
      filePath
    });

    return { blocks, metadata };
  }
};