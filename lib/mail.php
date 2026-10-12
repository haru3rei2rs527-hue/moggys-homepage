<?php

if (isset($_SERVER["SCRIPT_FILENAME"]) && realpath($_SERVER["SCRIPT_FILENAME"]) === realpath(__FILE__)) {
  http_response_code(404);
  exit;
}

require_once __DIR__ . "/reservations.php";

function moggys_mail_body($booking) {
  $day = moggys_day_by_date($booking["date"]);
  $ja = $day ? $day["ja"] : $booking["date"];
  $end = moggys_end_label($booking["time"]);
  $source = ($booking["source"] ?? "") === "phone" ? "電話" : "ウェブ";
  $lines = [
    "RENDO パターンオーダー会の予約が入りました。",
    "",
    "日時: {$ja} {$booking["time"]}–{$end}",
    "お名前: {$booking["name"]}",
    "電話: " . moggys_format_phone($booking["phone"]),
  ];
  if (($booking["email"] ?? "") !== "") $lines[] = "メール: {$booking["email"]}";
  if (($booking["note"] ?? "") !== "") $lines[] = "メモ: {$booking["note"]}";
  $lines[] = "受付: {$source}";
  if (($booking["code"] ?? "") !== "") $lines[] = "予約番号: {$booking["code"]}";
  return [$ja, implode("\n", $lines)];
}

function moggys_send_reservation_mail($booking) {
  if (getenv("MOGGYS_SKIP_MAIL") === "1") return true;
  if (($booking["source"] ?? "") === "closed" || ($booking["name"] ?? "") === "") return false;
  list($ja, $body) = moggys_mail_body($booking);
  $from = "info@moggys-shoe-studio.com";
  $to = "info@moggysshoestudio.com";
  $subject = "【予約】{$ja} {$booking["time"]} {$booking["name"]}";
  if (function_exists("mb_language")) mb_language("Japanese");
  if (function_exists("mb_internal_encoding")) mb_internal_encoding("UTF-8");
  $headers = "From: MOGGYS SHOE STUDIO <{$from}>\r\n";
  if (function_exists("mb_send_mail")) {
    return mb_send_mail($to, $subject, $body, $headers, "-f {$from}");
  }
  return false;
}

function moggys_try_mail($booking) {
  try {
    moggys_send_reservation_mail($booking);
  } catch (Throwable $error) {
    return;
  }
}
