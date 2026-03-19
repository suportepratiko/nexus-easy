"""Module for IQ Option http sms resource."""

from safirionapi.http.resource import Resource
import json


class SMS_Sender(Resource):
    """Class for IQ option sms resource."""
    # pylint: disable=too-few-public-methods

    url = ""

    def _post(self, data=None, headers=None):
        """Send post request for Safirion API sms http resource."""
        return self.api.send_http_request_v2(method="POST", url=self.api.url_auth2, data=data, headers=headers)

    def __call__(self, token_reason):
        """Method to get IQ Option API sms http request.

        :param str method: The method of a IQ Option server 2FA.
        :param str token_reason: The token of a IQ Option server 2FA.

        :returns: The instance of :class:`requests.Response`.
        """
        data = {"method": "sms",
                "token": token_reason}

        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Referer': 'https://iqoption.com/en/login',
            'Sec-Fetch-Mode': 'cors',
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
            }

        return self._post(data=data, headers=headers)
