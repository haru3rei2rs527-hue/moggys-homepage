<?php

require_once dirname(__DIR__) . "/lib/http.php";
require_once dirname(__DIR__) . "/lib/mail.php";

try {
  $method = $_SERVER["REQUEST_METHOD"] ?? "GET";
  if ($method === "GET") {
    if (!moggys_password_ok(moggys_bearer())) {
      if (moggys_password_configured() && !moggys_rate_allow("login", 8, 900)) {
        throw new MoggysReservationException("limited", "試行が続いています。少し待ってからもう一度お試しください。");
      }
      moggys_send(403, ["ok" => false, "error" => "denied", "message" => "パスワードが違います。"]);
    }
    moggys_send(200, array_merge(["ok" => true], moggys_admin_state()));
  }
  if ($method !== "POST") {
    moggys_send(405, ["ok" => false, "error" => "method", "message" => "この操作はできません。"]);
  }

  $body = moggys_read_json();
  if (($body["action"] ?? "") === "login") {
    if (!moggys_password_configured()) {
      moggys_send(503, ["ok" => false, "error" => "unavailable", "message" => "管理パスワードが未設定です。"]);
    }
    if (!moggys_password_ok((string) ($body["password"] ?? ""))) {
      if (!moggys_rate_allow("login", 8, 900)) {
        throw new MoggysReservationException("limited", "試行が続いています。少し待ってからもう一度お試しください。");
      }
      moggys_send(403, ["ok" => false, "error" => "denied", "message" => "パスワードが違います。"]);
    }
    moggys_send(200, ["ok" => true]);
  }

  if (!moggys_password_ok(moggys_bearer())) {
    moggys_send(403, ["ok" => false, "error" => "denied", "message" => "パスワードが違います。"]);
  }
  if (($body["action"] ?? "") === "close") {
    moggys_close_slot($body);
    moggys_send(200, ["ok" => true]);
  }
  if (($body["action"] ?? "") === "release") {
    moggys_release_slot($body);
    moggys_send(200, ["ok" => true]);
  }
  if (($body["action"] ?? "") === "book") {
    $booking = moggys_create_booking($body, null, "phone");
    moggys_try_mail($booking);
    moggys_send(201, ["ok" => true, "reservation" => moggys_reservation_payload($booking)]);
  }
  moggys_send(400, ["ok" => false, "error" => "invalid", "message" => "操作を確認してください。"]);
} catch (Throwable $error) {
  moggys_send_error($error);
}
