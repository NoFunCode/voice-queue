import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../index.css'; // import <widget-name>.css

async function onActivate(plugin: ReactRNPlugin) {

  await plugin.settings.registerStringSetting({
    id: 'openai key',
    title: 'OpenAI API Key',
    description: 'Needed to power the voice agent.',
  });

  await plugin.app.registerWidget('queue_voice_agent', WidgetLocation.QueueToolbar, {
    dimensions: {
      height: 'auto',
      width: 'auto',
    },
    widgetTabIcon: 'https://em-content.zobj.net/source/apple/453/speaker-high-volume_1f50a.png',
    widgetTabTitle: 'Voice Queue',
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
