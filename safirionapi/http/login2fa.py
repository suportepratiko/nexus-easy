"""Module for IQ Option http login resource."""

from safirionapi.http.resource import Resource


class Login2FA(Resource):
    """Class for IQ option login resource."""
    # pylint: disable=too-few-public-methods

    url = ""

    def _post(self, data=None, headers=None):
        """Send post request for Safirion API login logic with 2F security."""
        return self.api.send_http_request_v2(method="POST", url=self.api.url_login, data=data, headers=headers)

    def __call__(self, username, password, token_login):
        """Method to get IQ Option API login http request.

        :param str username: The username of a IQ Option server.
        :param str password: The password of a IQ Option server.
        :param str token: The token of a IQ Option server 2FA.

        :returns: The instance of :class:`requests.Response`.
        """
        data = {"identifier": username,
                "password": password,
                "token": token_login}

        return self._post(data=data)
