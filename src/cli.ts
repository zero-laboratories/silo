import { program } from 'commander';
import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { Store } from './storage/database.js';
import { loadConfig, dbPath, configPath } from './config/index.js';
import { providerFor } from './models/index.js';
import { ChatManager } from './chat/session.js';
import { App } from './ui/components/App.js';
import { toUserError } from './error/index.js';

export function buildCli(): typeof program {
  program
    .name('silo')
    .description('A minimal, model-agnostic CLI chat app for Linux.')
    .version('0.7.0');

  program
    .command('chat')
    .description('Open the interactive chat UI')
    .option('-m, --model <name>', 'model to use (from config)')
    .option('-r, --resume', 'resume the most recent conversation')
    .action((opts: { model?: string; resume?: boolean }) => {
      runChat(opts.model, opts.resume);
    });

  program
    .command('config')
    .description('Show where your config and database live')
    .action(() => {
      console.log(`Config:  ${configPath()}`);
      console.log(`Database: ${dbPath()}`);
    });

  program
    .command('export')
    .description('Export a chat as Markdown')
    .argument('<chatId>', 'chat id to export')
    .argument('[out]', 'output file (defaults to stdout)')
    .action((chatId: string, out?: string) => {
      exportChat(chatId, out);
    });

  return program;
}

function runChat(modelName?: string, resume?: boolean) {
  void (async () => {
    try {
      const config = loadConfig();
      const name = modelName ?? config.general.default_model;
      const model = config.models[name];
      if (!model) {
        console.error(`E: Model "${name}" is not configured in ${configPath()}`);
        process.exit(1);
      }

      const provider = providerFor(model.provider);
      const store = new Store();
      const manager = new ChatManager(store, provider, model, { resume });

      const renderer = await createCliRenderer({
        screenMode: 'alternate-screen',
        exitOnCtrlC: false,
        exitSignals: ['SIGTERM'],
        clearOnShutdown: true,
      });

      const root = createRoot(renderer);
      root.render(createElement(App, { manager, config, onRequestClose }));

      function onRequestClose() {
        try {
          root.unmount();
        } finally {
          renderer.destroy();
          process.exit(0);
        }
      }
    } catch (err) {
      console.error(toUserError(err));
      process.exit(1);
    }
  })();
}

function exportChat(chatId: string, out?: string) {
  try {
    const store = new Store();
    const chat = store.getChat(chatId);
    if (!chat) {
      console.error(`E: No chat found with id "${chatId}".`);
      process.exit(1);
    }

    let md = `# ${chat.title ?? 'Untitled chat'}\n\n`;
    for (const msg of chat.messages) {
      const name = msg.role === 'user' ? 'You' : 'Assistant';
      md += `**${name}:** ${msg.content}\n\n`;
    }

    if (out) {
      writeFileSync(out, md, 'utf8');
      console.log(`Exported to ${out}`);
    } else {
      console.log(md);
    }
  } catch (err) {
    console.error(toUserError(err));
    process.exit(1);
  }
}
