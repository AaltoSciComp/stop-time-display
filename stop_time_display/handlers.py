import json
import os

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from tornado.httpclient import AsyncHTTPClient, HTTPRequest
import tornado


class PollHandler(APIHandler):
    @tornado.web.authenticated
    @tornado.gen.coroutine
    def get(self):
        api_url = os.environ.get("JUPYTERHUB_API_URL", "")
        if not api_url:
            self.finish(json.dumps({
                "error": "API URL not found."
            }))
        else:
            token = os.environ.get("JUPYTERHUB_API_TOKEN", "")
            server_name = os.environ.get("JUPYTERHUB_SERVER_NAME", "")
            path = api_url + '/user'
            client = AsyncHTTPClient()
            request = HTTPRequest(
                path,
                headers={"Authorization": "token {}".format(token)}
            )
            response = yield client.fetch(request)
            json_obj = json.loads(response.body.decode('utf-8'))
            self.finish(json_obj | {"stop-time-display:server-name": server_name})


def setup_handlers(web_app):
    host_pattern = ".*$"

    base_url = web_app.settings["base_url"]
    poll_pattern = url_path_join(base_url, "stop-time-display", "poll")
    handlers = [(poll_pattern, PollHandler)]
    web_app.add_handlers(host_pattern, handlers)
