import ReactMarkdown from 'react-markdown';
import CodeBlock from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const code = String(children).replace(/\n$/, '');
            
            if (!inline && match) {
              return (
                <div className="my-4">
                  <CodeBlock
                    code={code}
                    language={match[1]}
                  />
                </div>
              );
            }

            if (!inline) {
              return (
                <div className="my-4">
                  <CodeBlock
                    code={code}
                    language="javascript"
                  />
                </div>
              );
            }

            return (
              <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-mono text-sm" {...props}>
                {children}
              </code>
            );
          },
          // Style other elements
          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-6 mb-4">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-4">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 italic my-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
