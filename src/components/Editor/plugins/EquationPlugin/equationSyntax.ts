// `$…$` needs non-space inside both delimiters and no digit after the closing
// one (pandoc's rules), so "$5-$10" stays text.
export const INLINE_DOLLAR_SOURCE = String.raw`\$(?![\s$])((?:\\[\s\S]|[^\\$])*?[^\s\\$])\$(?![\d$])`;

// `$$…$$` can't contain `$$`, so two equations on one line stay apart.
export const DISPLAY_DOLLAR_SOURCE = String.raw`\$\$((?:[^$]|\$(?!\$))+?)\$\$`;

// Neither can contain its closing delimiter.
export const PAREN_SOURCE = String.raw`\\\(((?:\\[^)]|[^\\])+?)\\\)`;
export const BRACKET_SOURCE = String.raw`\\\[((?:\\[^\]]|[^\\])+?)\\\]`;
