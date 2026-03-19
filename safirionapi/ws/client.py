"""Module for Dayprofit websocket."""

import json, time
import logging
import websocket
import safirionapi.constants as OP_code
import safirionapi.global_value as global_value
from threading import Thread
from safirionapi.ws.received.technical_indicators import technical_indicators
from safirionapi.ws.received.time_sync import time_sync
from safirionapi.ws.received.heartbeat import heartbeat
from safirionapi.ws.received.balances import balances
from safirionapi.ws.received.profile import profile
from safirionapi.ws.received.balance_changed import balance_changed
from safirionapi.ws.received.candles import candles
from safirionapi.ws.received.buy_complete import buy_complete
from safirionapi.ws.received.option import option
from safirionapi.ws.received.position_history import position_history
from safirionapi.ws.received.list_info_data import list_info_data
from safirionapi.ws.received.candle_generated import candle_generated_realtime
from safirionapi.ws.received.candle_generated_v2 import candle_generated_v2
from safirionapi.ws.received.commission_changed import commission_changed
from safirionapi.ws.received.socket_option_opened import socket_option_opened
from safirionapi.ws.received.api_option_init_all_result import api_option_init_all_result
from safirionapi.ws.received.initialization_data import initialization_data
from safirionapi.ws.received.underlying_list import underlying_list
from safirionapi.ws.received.instruments import instruments
from safirionapi.ws.received.financial_information import financial_information
from safirionapi.ws.received.position_changed import position_changed
from safirionapi.ws.received.option_opened import option_opened
from safirionapi.ws.received.option_closed import option_closed
from safirionapi.ws.received.top_assets_updated import top_assets_updated
from safirionapi.ws.received.strike_list import strike_list
from safirionapi.ws.received.api_game_betinfo_result import api_game_betinfo_result
from safirionapi.ws.received.traders_mood_changed import traders_mood_changed
from safirionapi.ws.received.order import order
from safirionapi.ws.received.position import position
from safirionapi.ws.received.positions import positions
from safirionapi.ws.received.order_placed_temp import order_placed_temp
from safirionapi.ws.received.deferred_orders import deferred_orders
from safirionapi.ws.received.history_positions import history_positions
from safirionapi.ws.received.available_leverages import available_leverages
from safirionapi.ws.received.order_canceled import order_canceled
from safirionapi.ws.received.position_closed import position_closed
from safirionapi.ws.received.overnight_fee import overnight_fee
from safirionapi.ws.received.api_game_getoptions_result import api_game_getoptions_result
from safirionapi.ws.received.sold_options import sold_options
from safirionapi.ws.received.tpsl_changed import tpsl_changed
from safirionapi.ws.received.auto_margin_call_changed import auto_margin_call_changed
from safirionapi.ws.received.digital_option_placed import digital_option_placed
from safirionapi.ws.received.result import result
from safirionapi.ws.received.instrument_quotes_generated import instrument_quotes_generated
from safirionapi.ws.received.training_balance_reset import training_balance_reset
from safirionapi.ws.received.socket_option_closed import socket_option_closed
from safirionapi.ws.received.live_deal_binary_option_placed import live_deal_binary_option_placed
from safirionapi.ws.received.live_deal_digital_option import live_deal_digital_option
from safirionapi.ws.received.leaderboard_deals_client import leaderboard_deals_client
from safirionapi.ws.received.live_deal import live_deal
from safirionapi.ws.received.user_profile_client import user_profile_client
from safirionapi.ws.received.leaderboard_userinfo_deals_client import leaderboard_userinfo_deals_client
from safirionapi.ws.received.client_price_generated import client_price_generated
from safirionapi.ws.received.users_availability import users_availability


class WebsocketClient(object):
    """Class for work with Avalon websocket."""

    def __init__(self, api):
        """
        :param api: The instance of :class:`AvalonAPI
            <avalon.api.AvalonAPI>`.
        """
        self.api = api
        self.wss = websocket.WebSocketApp(
            self.api.wss_url, on_message=self.on_message,
            on_error=self.on_error, on_close=self.on_close,
            on_open=self.on_open)

    def dict_queue_add(self, dict, maxdict, key1, key2, key3, value):
        if key3 in dict[key1][key2]:
            dict[key1][key2][key3] = value
        else:
            while True:
                try:
                    dic_size = len(dict[key1][key2])
                except:
                    dic_size = 0
                if dic_size < maxdict:
                    dict[key1][key2][key3] = value
                    break
                else:
                    # del mini key
                    del dict[key1][key2][sorted(
                        dict[key1][key2].keys(), reverse=False)[0]]

    def api_dict_clean(self, obj):
        if len(obj) > 5000:
            for k in obj.keys():
                del obj[k]
                break

    def on_message(self, wss, message):  # pylint: disable=unused-argument
        """Method to process websocket messages."""
        global_value.ssl_Mutual_exclusion = True
        logger = logging.getLogger(__name__)
        logger.debug(message)

        message = json.loads(str(message))


        technical_indicators(self.api, message, self.api_dict_clean)
        time_sync(self.api, message)
        heartbeat(self.api, message)
        balances(self.api, message)
        profile(self.api, message)
        balance_changed(self.api, message)
        candles(self.api, message)
        buy_complete(self.api, message)
        option(self.api, message)
        position_history(self.api, message)
        list_info_data(self.api, message)
        candle_generated_realtime(self.api, message, self.dict_queue_add)
        candle_generated_v2(self.api, message, self.dict_queue_add)
        commission_changed(self.api, message)
        socket_option_opened(self.api, message)
        api_option_init_all_result(self.api, message)
        initialization_data(self.api, message)
        underlying_list(self.api, message)
        instruments(self.api, message)
        financial_information(self.api, message)
        position_changed(self.api, message)
        option_opened(self.api, message)
        option_closed(self.api, message)
        top_assets_updated(self.api, message)
        strike_list(self.api, message)
        api_game_betinfo_result(self.api, message)
        traders_mood_changed(self.api, message)
         # ------for forex&cfd&crypto..
        order_placed_temp(self.api, message)
        order(self.api, message)
        position(self.api, message)
        positions(self.api, message)
        order_placed_temp(self.api, message)
        deferred_orders(self.api, message)
        history_positions(self.api, message)
        available_leverages(self.api, message)
        order_canceled(self.api, message)
        position_closed(self.api, message)
        overnight_fee(self.api, message)
        api_game_getoptions_result(self.api, message)
        sold_options(self.api, message)
        tpsl_changed(self.api, message)
        auto_margin_call_changed(self.api, message)
        digital_option_placed(self.api, message, self.api_dict_clean)
        result(self.api, message)
        instrument_quotes_generated(self.api, message)
        training_balance_reset(self.api, message)
        socket_option_closed(self.api, message)
        live_deal_binary_option_placed(self.api, message)
        live_deal_digital_option(self.api, message)
        leaderboard_deals_client(self.api, message)
        live_deal(self.api, message)
        user_profile_client(self.api, message)
        leaderboard_userinfo_deals_client(self.api, message)
        users_availability(self.api, message)
        client_price_generated(self.api, message)

        global_value.ssl_Mutual_exclusion = False

    @staticmethod
    def on_error(wss, error):  # pylint: disable=unused-argument
        """Method to process websocket errors."""
        logger = logging.getLogger(__name__)
        logger.error(error)
        global_value.websocket_error_reason = str(error)
        global_value.check_websocket_if_error = True
        # Marcar que a conexão foi perdida para permitir reconexão
        global_value.check_websocket_if_connect = 0

    @staticmethod
    def on_open(wss):  # pylint: disable=unused-argument
        """Method to process websocket open."""
        logger = logging.getLogger(__name__)
        logger.debug("Websocket client connected.")
        global_value.check_websocket_if_connect = 1

    def on_close(self, wss, close_status_code=None, close_msg=None):
        """Called when websocket connection is closed.
        
        :param wss: WebSocket instance.
        :param close_status_code: Status code for close connection.
        :param close_msg: Message explaining why connection was closed.
        """
        logging.debug("WebSocketClient closed connection.")
        self.connected = False
        # Marcar que a conexão foi perdida para permitir reconexão
        global_value.check_websocket_if_connect = 0
