<?php
// 予約番号が記録と一致するときだけ、工房へ通知を送る。宛先は変えられない。

require_once __DIR__ . "/lib/http.php";
require_once __DIR__ . "/lib/mail.php";

try {
  if (($_SERVER["REQUEST_METHOD"] ?? "GET") !== "POST") {
    moggys_send(405, ["ok" => false, "message" => "この操作はできません。"]);
  }
  if (!moggys_rate_allow("mail", 8, 600)) {
    throw new MoggysReservationException("limited", "送信が続いています。少し待ってからもう一度お試しください。");
  }
  $input = moggys_read_json();
  $date = (string) ($input["date"] ?? "");
  $time = (string) ($input["time"] ?? "");
  $code = strtoupper(trim((string) ($input["code"] ?? "")));
  if (!moggys_known_slot($date, $time) || !preg_match("/^[0-9A-F]{8}$/", $code)) {
    throw new MoggysReservationException("invalid", "送信できませんでした。");
  }
  $slots = moggys_read_slots();
  $row = $slots[moggys_slot_key($date, $time)] ?? null;
  if (!$row || strtoupper((string) ($row["code"] ?? "")) !== $code) {
    throw new MoggysReservationException("invalid", "送信できませんでした。");
  }
  if (!moggys_send_reservation_mail($row)) {
    moggys_send(500, ["ok" => false, "message" => "メールを送れませんでした。"]);
  }
  moggys_send(200, ["ok" => true]);
} catch (Throwable $error) {
  moggys_send_error($error);
}
