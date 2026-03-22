import React from 'react'

// Renders a line of text, converting **bold** markers into <strong> elements
function renderLine(line: string, key: number) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span key={key}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        return part
      })}
    </span>
  )
}

// Renders AI-generated markdown text into structured JSX
// Handles: # ## ### headings, - bullets, indented sub-bullets, **bold**
export function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />

        if (/^#{1,3} /.test(line)) {
          const content = line.replace(/^#{1,3} /, '')
          return (
            <h3 key={i} className="font-semibold text-base mt-4 mb-1 first:mt-0">
              {renderLine(content, i)}
            </h3>
          )
        }

        if (/^\s{2,}- /.test(line)) {
          return (
            <div key={i} className="flex gap-2 pl-5 text-muted-foreground">
              <span className="shrink-0">◦</span>
              <span>{renderLine(line.replace(/^\s+-\s/, ''), i)}</span>
            </div>
          )
        }

        if (line.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-primary">•</span>
              <span>{renderLine(line.replace(/^- /, ''), i)}</span>
            </div>
          )
        }

        return <p key={i}>{renderLine(line, i)}</p>
      })}
    </div>
  )
}
