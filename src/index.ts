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


// update every minute
const POLL_EVERY = 60;

// constants obtained from server
let START_TIME: Date;
let MAX_TIME: Date;
let TIMEOUT: number;
let MAX_AGE: number;
let SERVER_NAME: string;

// to store setInterval id
let interval_id: number | null = null;

// Minimal typing for the `servers` entries
interface ServerEntry {
  last_activity: string;
  started: string;
}

// Minimal typing for the server extension response
interface Response {
  'stop-time-display': {
    timeout: number;
    max_age: number;
    server_name: string;
  };
  servers: {
    [server_name: string] : ServerEntry;
  };
  error: string;
}

function stopPolling(): void {
  console.error("Encountered a problem (network error?), stopping polling");
  if (interval_id) clearInterval(interval_id);
}

function updateTextElement(textElement: HTMLDivElement, serverInfo: ServerEntry): void {
  const last_activity = new Date(serverInfo['last_activity']);
  const timeout = new Date();
  timeout.setTime(last_activity.getTime() + TIMEOUT*1000);
  const earlier = timeout > MAX_TIME ? MAX_TIME : timeout;
  textElement.innerText = "Server will stop at "
    + earlier.toTimeString().slice(0,5);
}

function setupPolling(textElement: HTMLDivElement): void {
  requestAPI<Response>('poll')
    .then(data => {

      // first check if the server extension is working properly
      if (!("stop-time-display" in data)){
        console.error(
          "The stop_time_display server extension appears to not be working. " +
          "Is $JUPYTERHUB_API_URL set correctly?"
        );
      } else if (!("servers" in data)){
        console.error(
          "stop_time_display: can't access server data, " +
          "check if the API token has 'read:servers!server' scope"
        );

      // everything looks fine
      } else {
        // setup constants
        TIMEOUT = data["stop-time-display"].timeout;
        MAX_AGE = data["stop-time-display"].max_age;
        SERVER_NAME = data["stop-time-display"].server_name;
        START_TIME = new Date(data.servers[SERVER_NAME].started);
        MAX_TIME = new Date(START_TIME.getTime() + MAX_AGE*1000);  // getTime() is in ms
        updateTextElement(textElement, data.servers[SERVER_NAME]);
        interval_id = setInterval(poll, POLL_EVERY*1000, textElement);
      }
    })
    .catch(reason => {
      console.error(
        `The stop_time_display server extension appears to be missing
        or there was a network problem.\n${reason}`
      );
    })
}

function poll(textElement: HTMLDivElement): void {
  requestAPI<Response>('poll')
    .then(data => {
      updateTextElement(textElement, data.servers[SERVER_NAME]);
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

  setupPolling(textNode);
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
