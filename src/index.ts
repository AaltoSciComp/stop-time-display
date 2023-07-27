import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  IToolbarWidgetRegistry,
} from '@jupyterlab/apputils';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { Widget } from '@lumino/widgets';

import { requestAPI } from './handler';


// These two below could be converted to settings one can set in
// JupyterLab, but not sure if that is a good idea.

// taken from our jupyterhub_config.py, in seconds
const DEFAULT_TIMEOUT = 3600;
const DEFAULT_TIMELIMIT = 3600*8;
// update every minute
const POLL_EVERY = 60;


let interval_id: number | null = null;
let start_time: Date | null = null;
let max_time: Date;

// Minimal typing for the `servers` entries
interface ServerInfo {
  last_activity: string;
  started: string;
}

function stopPolling(): void {
  console.error("Encountered NetworkError, stopping polling");
  if (interval_id) clearInterval(interval_id);
}

function updateTextElement(textElement: HTMLDivElement, serverInfo: ServerInfo): void {
  // first call, set variables
  if (!start_time){
    start_time = new Date(serverInfo['started']);
    max_time = new Date(start_time.getTime() + DEFAULT_TIMELIMIT*1000);  // getTime() is in ms
  }
  const timeout = new Date(serverInfo['last_activity']);
  timeout.setTime(timeout.getTime() + DEFAULT_TIMEOUT*1000);
  const earlier = timeout > max_time ? max_time : timeout;
  textElement.innerText = "Server will stop at " + earlier.toTimeString().slice(0,5);
}

function poll(textElement: HTMLDivElement): void {
  requestAPI<any>('poll')
    .then(data => {

      // check if token is giving enough info
      if (!("servers" in data)) {
        console.log(data);
        console.error(
          "stop_time_display: can't access server data, " +
          "check if the API token has 'read:servers!server' scope"
        );
        stopPolling();
      } else { // we have enough info
        const serverName: string = data["stop-time-display:server-name"];
        updateTextElement(textElement, data.servers[serverName]);
      }
    })
    .catch(reason => {
      console.error(
        `The stop_time_display server extension appears to be missing
        or there was a network problem.\n${reason}`
      );
      stopPolling();
    });
}

function activateExtension(
  app: JupyterFrontEnd,
  toolbarRegistry: IToolbarWidgetRegistry,
  settingRegistry: ISettingRegistry | null
): void {
  console.log('JupyterLab extension stop-time-display is activated!');

  // initialize HTML element and placeholder text
  const textNode = document.createElement('div');
  textNode.innerText = "stop-time-display failed to initialize";
  toolbarRegistry.addFactory('TopBar', 'text', () => {
    const textWidget = new Widget({ node: textNode });
    textWidget.addClass('jp-TopBar-StopText');
    return textWidget;
  });

  if (settingRegistry) {
    settingRegistry
      .load(plugin.id)
      .then(settings => {
        console.log('stop-time-display settings loaded:', settings.composite);
      })
      .catch(reason => {
        console.error('Failed to load settings for stop-time-display.', reason);
      });
  }

  // communicate with the server extension repeatedly
  poll(textNode);
  interval_id = setInterval(poll, POLL_EVERY*1000, textNode);
}

/**
 * Initialization data for the stop-time-display extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'stop-time-display:plugin',
  description: 'A JupyterLab extension to display the time when JupyterHub will stop this server.',
  autoStart: true,
  requires: [IToolbarWidgetRegistry],
  optional: [ISettingRegistry],
  activate: activateExtension
};

export default plugin;
