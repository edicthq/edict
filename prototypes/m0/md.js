// PROTOTYPE (M0). A tiny markdown renderer, enough for seed descriptions,
// comments and progress updates. Not the real thing (that is Tiptap).
(() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function inline(s) {
    const codes = [];
    s = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    s = s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/(^|[\s(])@([A-Za-z]+)/g, '$1<span class="md-mention">@$2</span>')
      .replace(/\b((?:ENG|OPS)-\d+)\b/g, '<a class="md-ref" data-act="open" data-id="$1" href="#$1">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  window.md = function md(src) {
    const lines = src.split('\n');
    let html = '', list = null, para = [];
    const flushPara = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
    const flushList = () => { if (list) { html += `</${list}>`; list = null; } };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('```')) {
        flushPara(); flushList();
        const buf = [];
        while (++i < lines.length && !lines[i].startsWith('```')) buf.push(esc(lines[i]));
        html += `<pre><code>${buf.join('\n')}</code></pre>`;
        continue;
      }
      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)/))) {
        flushPara(); flushList();
        const level = m[1].length + 2; // descriptions sit under the issue title
        html += `<h${level}>${inline(m[2])}</h${level}>`;
      } else if ((m = line.match(/^- \[( |x)\]\s+(.*)/))) {
        flushPara();
        if (list !== 'ul') { flushList(); html += '<ul class="md-tasks">'; list = 'ul'; }
        html += `<li class="${m[1] === 'x' ? 'is-done' : ''}"><span class="md-check" aria-hidden="true"></span>${inline(m[2])}</li>`;
      } else if ((m = line.match(/^[-*]\s+(.*)/))) {
        flushPara();
        if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; }
        html += `<li>${inline(m[1])}</li>`;
      } else if ((m = line.match(/^\d+\.\s+(.*)/))) {
        flushPara();
        if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; }
        html += `<li>${inline(m[1])}</li>`;
      } else if (!line.trim()) {
        flushPara(); flushList();
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara(); flushList();
    return html;
  };
  window.mdInline = inline;
})();
