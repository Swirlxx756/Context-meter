# context-meter

A Claude Code plugin that shows the live context window usage in the prompt footer, beside the mode labels:

```
Context 42% · 84k / 200k
```

Before it, totals for the session's main loop: turns and model steps, decode speed, all tokens sent and received, and the prompt cache hit rate:

```
4 轮·48 步 · 215 tok/s · 3.6M tok · 缓存命中 94.01% · Context 42% · 84k / 200k
```

Click the totals to open a pane with turns, steps, LLM time, tool time (a permission prompt's wait counts), average time per step and to first token, decode speed and the token split. Click the context figure to open a pane with the window broken down by category, as `/context` does. `/clear` starts the totals over.

It updates after every model response. Before the first response of a session (or right after a compaction) it shows the window alone: `Context — / 200k`.

Works in the terminal and in the Claude desktop app's Code tab. Needs Claude Code 2.1.299 or newer.

## Install

At the prompt of a terminal session:

```
/plugin install context-meter --marketplace Swirlxx756/context-meter
```

Answer `y` to add the marketplace, then pick the user scope.

From a shell:

```
claude plugin install context-meter --marketplace Swirlxx756/context-meter
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `Swirlxx756/context-meter`, then Add plugin.

The plugin shows up in each session started after the install.
