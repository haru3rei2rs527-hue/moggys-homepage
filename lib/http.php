<?php

if (isset($_SERVER["SCRIPT_FILENAME"]) && realpath($_SERVER["SCRIPT_FILENAME"]) === realpath(__FILE__)) {
  http_response_code(404);
  exit;
}

require_once __DIR__ . "/reservations.php";

function moggys_send($status, $body) {
  http_response_code($status);
  header("Content-Type: application/json; charset=UTF-8");
  header("Cache-Control: no-store");
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

function moggys_send_error($error) {
  $status = [
    "invalid" => 400,
    "past" => 409,
    "taken" => 409,
    "missing" => 404,
    "denied" => 403,
    "unavailable" => 503,
    "limited" => 429,
  ];
  if ($error instanceof MoggysReservationException) {
    $code = $error->errorCode;
    moggys_send($status[$code] ?? 400, [
      "ok" => false,
      "error" => $code,
      "message" => $error->getMessage(),
    ]);
  }
  moggys_send(500, [
    "ok" => false,
    "error" => "error",
    "message" => "処理できませんでした。時間をおいてもう一度お試しください。",
  ]);
}

function moggys_read_json() {
  $raw = file_get_contents("php://input");
  if ($raw === false) $raw = "";
  if (strlen($raw) > 10000) {
    throw new MoggysReservationException("invalid", "送信内容が大きすぎます。");
  }
  if ($raw === "") return [];
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    throw new MoggysReservationException("invalid", "送信できませんでした。");
  }
  return $data;
}

function moggys_bearer() {
  $header = $_SERVER["HTTP_AUTHORIZATION"] ?? ($_SERVER["REDIRECT_HTTP_AUTHORIZATION"] ?? "");
  if ($header === "" && function_exists("getallheaders")) {
    $headers = getallheaders();
    foreach ($headers as $name => $value) {
      if (strcasecmp($name, "Authorization") === 0) $header = $value;
    }
  }
  if (strpos($header, "Bearer ") !== 0) return "";
  return substr($header, 7);
}
