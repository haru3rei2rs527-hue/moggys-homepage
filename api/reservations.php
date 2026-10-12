<?php

require_once dirname(__DIR__) . "/lib/http.php";
require_once dirname(__DIR__) . "/lib/mail.php";

try {
  $method = $_SERVER["REQUEST_METHOD"] ?? "GET";
  if ($method === "GET") {
    moggys_send(200, array_merge(["ok" => true], moggys_public_state()));
  }
  if ($method === "DELETE") {
    moggys_cancel_booking(moggys_read_json());
    moggys_send(200, ["ok" => true, "message" => "予約を取り消しました。"]);
  }
  if ($method === "POST") {
    $body = moggys_read_json();
    if (($body["action"] ?? "") === "cancel") {
      moggys_cancel_booking($body);
      moggys_send(200, ["ok" => true, "message" => "予約を取り消しました。"]);
    }
    if (!moggys_rate_allow("book", 12, 600)) {
      throw new MoggysReservationException("limited", "送信が続いています。少し待ってからもう一度お試しください。");
    }
    $booking = moggys_create_booking($body, null, "web");
    moggys_try_mail($booking);
    moggys_send(201, ["ok" => true, "reservation" => moggys_reservation_payload($booking)]);
  }
  moggys_send(405, ["ok" => false, "error" => "method", "message" => "この操作はできません。"]);
} catch (Throwable $error) {
  moggys_send_error($error);
}
