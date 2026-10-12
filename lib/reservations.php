<?php
// 予約の記録。お名前.com の PHP からだけ使う。ブラウザで直接開くと中身は出さない。

if (isset($_SERVER["SCRIPT_FILENAME"]) && realpath($_SERVER["SCRIPT_FILENAME"]) === realpath(__FILE__)) {
  http_response_code(404);
  exit;
}

class MoggysReservationException extends Exception {
  public $errorCode;

  public function __construct($errorCode, $message) {
    parent::__construct($message);
    $this->errorCode = $errorCode;
  }
}

function moggys_days() {
  return [
    ["date" => "2026-11-21", "heading" => "11.21 Sat", "ja" => "11月21日（土）"],
    ["date" => "2026-11-22", "heading" => "11.22 Sun", "ja" => "11月22日（日）"],
  ];
}

function moggys_times() {
  return ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
}

function moggys_slot_key($date, $time) {
  return $date . "T" . $time;
}

function moggys_end_label($time) {
  $hour = (int) substr($time, 0, 2) + 1;
  return sprintf("%02d:00", $hour);
}

function moggys_known_slot($date, $time) {
  $dates = array_column(moggys_days(), "date");
  return in_array($date, $dates, true) && in_array($time, moggys_times(), true);
}

function moggys_day_by_date($date) {
  foreach (moggys_days() as $day) {
    if ($day["date"] === $date) return $day;
  }
  return null;
}

function moggys_stamp($now) {
  $zone = new DateTimeZone("Asia/Tokyo");
  if ($now instanceof DateTimeInterface) {
    $tokyo = (new DateTimeImmutable("@" . $now->getTimestamp()))->setTimezone($zone);
  } else {
    $tokyo = new DateTimeImmutable("now", $zone);
  }
  return [
    "date" => $tokyo->format("Y-m-d"),
    "minutes" => ((int) $tokyo->format("H")) * 60 + (int) $tokyo->format("i"),
  ];
}

function moggys_is_past($date, $time, $now) {
  $stamp = moggys_stamp($now);
  if ($stamp["date"] > $date) return true;
  if ($stamp["date"] < $date) return false;
  $end = moggys_end_label($time);
  $parts = explode(":", $end);
  return $stamp["minutes"] >= ((int) $parts[0]) * 60 + (int) $parts[1];
}

function moggys_event_ended($now) {
  foreach (moggys_days() as $day) {
    foreach (moggys_times() as $time) {
      if (!moggys_is_past($day["date"], $time, $now)) return false;
    }
  }
  return true;
}

function moggys_strlen($value) {
  if (function_exists("mb_strlen")) return mb_strlen($value, "UTF-8");
  $count = preg_match_all("/./u", $value);
  return $count === false ? strlen($value) : $count;
}

function moggys_normalize_name($value) {
  $name = preg_replace("/\s+/u", " ", trim((string) $value));
  if ($name === null) return null;
  $length = moggys_strlen($name);
  if ($length < 1 || $length > 40) return null;
  if (preg_match("/[\x00-\x1F\x7F]/", $name)) return null;
  return $name;
}

function moggys_normalize_phone($value) {
  $raw = (string) $value;
  $raw = strtr($raw, [
    "０" => "0", "１" => "1", "２" => "2", "３" => "3", "４" => "4",
    "５" => "5", "６" => "6", "７" => "7", "８" => "8", "９" => "9",
    "＋" => "+",
  ]);
  $raw = preg_replace("/[^\d+]/", "", $raw);
  if (strpos($raw, "+81") === 0) $raw = substr($raw, 3);
  else if (preg_match("/^81\d{9,11}$/", $raw)) $raw = substr($raw, 2);
  if ($raw === "" || $raw[0] !== "0") $raw = "0" . $raw;
  if (!preg_match("/^0[1-9]\d{8,9}$/", $raw)) return null;
  return $raw;
}

function moggys_normalize_email($value) {
  $email = trim((string) $value);
  if ($email === "") return "";
  if (strlen($email) > 120 || !preg_match("/^[^\s@]+@[^\s@]+\.[^\s@]+$/", $email)) return null;
  if (preg_match("/[\r\n]/", $email)) return null;
  return $email;
}

function moggys_normalize_note($value) {
  $note = str_replace("\r\n", "\n", trim((string) $value));
  $note = str_replace("\r", "\n", $note);
  $length = moggys_strlen($note);
  if ($length > 400) return null;
  return $note;
}

function moggys_format_phone($digits) {
  if (strlen($digits) === 11) {
    return substr($digits, 0, 3) . "-" . substr($digits, 3, 4) . "-" . substr($digits, 7);
  }
  if (strlen($digits) === 10) {
    return substr($digits, 0, 3) . "-" . substr($digits, 3, 3) . "-" . substr($digits, 6);
  }
  return $digits;
}

function moggys_data_dir() {
  $override = getenv("MOGGYS_DATA_DIR");
  if ($override) return $override;
  return dirname(__DIR__) . DIRECTORY_SEPARATOR . "data";
}

function moggys_store_file() {
  return moggys_data_dir() . DIRECTORY_SEPARATOR . "reservations.php";
}

function moggys_rate_file() {
  return moggys_data_dir() . DIRECTORY_SEPARATOR . "rate.php";
}

function moggys_config() {
  $path = getenv("MOGGYS_CONFIG_FILE");
  if (!$path) $path = moggys_data_dir() . DIRECTORY_SEPARATOR . "config.php";
  if (!is_file($path)) return [];
  $config = include $path;
  return is_array($config) ? $config : [];
}

function moggys_durable() {
  $dir = moggys_data_dir();
  if (!is_dir($dir) && !@mkdir($dir, 0705, true) && !is_dir($dir)) return false;
  return is_writable($dir);
}

function moggys_assert_available() {
  if (!moggys_durable()) {
    throw new MoggysReservationException(
      "unavailable",
      "ウェブでの予約は、まだ受け付けていません。お電話（052-784-5492）でご連絡ください。"
    );
  }
}

function moggys_assert_slot_open($date, $time, $now) {
  if (!moggys_known_slot($date, $time)) {
    throw new MoggysReservationException("invalid", "時間を選び直してください。");
  }
  if (moggys_is_past($date, $time, $now)) {
    throw new MoggysReservationException("past", "この時間は受付を終了しています。");
  }
}

function moggys_decode_store($raw) {
  $marker = "__MOGGYS__\n";
  $pos = strpos($raw, $marker);
  if ($pos === false) return [];
  $json = base64_decode(trim(substr($raw, $pos + strlen($marker))), true);
  if ($json === false) return [];
  $data = json_decode($json, true);
  if (!is_array($data)) return [];
  return $data;
}

function moggys_encode_store($data) {
  $json = json_encode($data, JSON_UNESCAPED_UNICODE);
  if ($json === false) {
    throw new MoggysReservationException("unavailable", "処理できませんでした。時間をおいてもう一度お試しください。");
  }
  return "<?php\nhttp_response_code(404);\nexit;\n?>\n__MOGGYS__\n" . base64_encode($json) . "\n";
}

function moggys_locked($file, $exclusive, $fn) {
  moggys_assert_available();
  $handle = fopen($file, "c+");
  if ($handle === false) {
    throw new MoggysReservationException(
      "unavailable",
      "ウェブでの予約は、まだ受け付けていません。お電話（052-784-5492）でご連絡ください。"
    );
  }
  try {
    if (!flock($handle, $exclusive ? LOCK_EX : LOCK_SH)) {
      throw new MoggysReservationException("unavailable", "混み合っています。もう一度お試しください。");
    }
    rewind($handle);
    $raw = stream_get_contents($handle);
    $data = moggys_decode_store($raw === false ? "" : $raw);
    $result = $fn($data);
    if (is_array($result) && array_key_exists("write", $result)) {
      $body = moggys_encode_store($result["write"]);
      rewind($handle);
      if (!ftruncate($handle, 0) || fwrite($handle, $body) === false) {
        throw new MoggysReservationException("unavailable", "処理できませんでした。時間をおいてもう一度お試しください。");
      }
      fflush($handle);
      return $result["return"];
    }
    return $result;
  } finally {
    flock($handle, LOCK_UN);
    fclose($handle);
  }
}

function moggys_slots($fn) {
  return moggys_locked(moggys_store_file(), true, $fn);
}

function moggys_read_slots() {
  return moggys_locked(moggys_store_file(), false, function ($slots) {
    return $slots;
  });
}

function moggys_create_booking($input, $now = null, $channel = "web") {
  if ($now === null) $now = new DateTimeImmutable("now", new DateTimeZone("Asia/Tokyo"));
  moggys_assert_available();
  if (trim((string) ($input["company"] ?? "")) !== "") {
    throw new MoggysReservationException("invalid", "送信できませんでした。");
  }
  $date = (string) ($input["date"] ?? "");
  $time = (string) ($input["time"] ?? "");
  moggys_assert_slot_open($date, $time, $now);
  $name = moggys_normalize_name($input["name"] ?? "");
  $phone = moggys_normalize_phone($input["phone"] ?? "");
  $email = moggys_normalize_email($input["email"] ?? "");
  $note = moggys_normalize_note($input["note"] ?? "");
  if ($name === null) throw new MoggysReservationException("invalid", "お名前を入力してください。");
  if ($phone === null) throw new MoggysReservationException("invalid", "電話番号を確認してください。");
  if ($email === null) throw new MoggysReservationException("invalid", "メールアドレスを確認してください。");
  if ($note === null) throw new MoggysReservationException("invalid", "メモは400文字以内にしてください。");

  $booking = [
    "code" => strtoupper(bin2hex(random_bytes(4))),
    "cancelToken" => bin2hex(random_bytes(24)),
    "date" => $date,
    "time" => $time,
    "name" => $name,
    "phone" => $phone,
    "email" => $email,
    "note" => $note,
    "source" => $channel === "phone" ? "phone" : "web",
    "createdAt" => gmdate("Y-m-d\TH:i:s\Z", $now->getTimestamp()),
  ];

  $id = moggys_slot_key($date, $time);
  $saved = moggys_slots(function ($slots) use ($id, $booking) {
    if (isset($slots[$id])) return ["return" => "TAKEN"];
    $slots[$id] = $booking;
    return ["write" => $slots, "return" => "OK"];
  });
  if ($saved !== "OK") {
    throw new MoggysReservationException("taken", "この枠は先ほど埋まりました。別の時間を選んでください。");
  }
  return $booking;
}

function moggys_close_slot($input, $now = null) {
  if ($now === null) $now = new DateTimeImmutable("now", new DateTimeZone("Asia/Tokyo"));
  moggys_assert_available();
  $date = (string) ($input["date"] ?? "");
  $time = (string) ($input["time"] ?? "");
  moggys_assert_slot_open($date, $time, $now);
  $note = moggys_normalize_note($input["note"] ?? "");
  if ($note === null) throw new MoggysReservationException("invalid", "メモは400文字以内にしてください。");
  $booking = [
    "code" => "",
    "cancelToken" => bin2hex(random_bytes(24)),
    "date" => $date,
    "time" => $time,
    "name" => "",
    "phone" => "",
    "email" => "",
    "note" => $note,
    "source" => "closed",
    "createdAt" => gmdate("Y-m-d\TH:i:s\Z", $now->getTimestamp()),
  ];
  $id = moggys_slot_key($date, $time);
  $saved = moggys_slots(function ($slots) use ($id, $booking) {
    if (isset($slots[$id])) return ["return" => "TAKEN"];
    $slots[$id] = $booking;
    return ["write" => $slots, "return" => "OK"];
  });
  if ($saved !== "OK") {
    throw new MoggysReservationException("taken", "この枠にはすでに予約があります。");
  }
  return $booking;
}

function moggys_release_slot($input) {
  $date = (string) ($input["date"] ?? "");
  $time = (string) ($input["time"] ?? "");
  if (!moggys_known_slot($date, $time)) {
    throw new MoggysReservationException("invalid", "時間を選び直してください。");
  }
  $id = moggys_slot_key($date, $time);
  $saved = moggys_slots(function ($slots) use ($id) {
    if (!isset($slots[$id])) return ["return" => "MISSING"];
    unset($slots[$id]);
    return ["write" => $slots, "return" => "OK"];
  });
  if ($saved !== "OK") {
    throw new MoggysReservationException("missing", "この枠はすでに空いています。");
  }
}

function moggys_cancel_booking($input) {
  $date = (string) ($input["date"] ?? "");
  $time = (string) ($input["time"] ?? "");
  $token = (string) ($input["cancelToken"] ?? "");
  if (!moggys_known_slot($date, $time) || $token === "") {
    throw new MoggysReservationException("invalid", "取り消せませんでした。");
  }
  $id = moggys_slot_key($date, $time);
  $saved = moggys_slots(function ($slots) use ($id, $token) {
    if (!isset($slots[$id])) return ["return" => "MISSING"];
    $stored = (string) ($slots[$id]["cancelToken"] ?? "");
    if ($stored === "" || !hash_equals($stored, $token)) return ["return" => "DENIED"];
    unset($slots[$id]);
    return ["write" => $slots, "return" => "OK"];
  });
  if ($saved === "MISSING") throw new MoggysReservationException("missing", "この予約は見つかりません。");
  if ($saved !== "OK") throw new MoggysReservationException("denied", "取り消せませんでした。");
}

function moggys_slot_view($date, $time, $row, $now, $live) {
  if (moggys_is_past($date, $time, $now)) return "past";
  if (!$live) return "unknown";
  if (!$row) return "open";
  if (($row["source"] ?? "") === "closed") return "closed";
  return "taken";
}

function moggys_public_booking($row) {
  if (!$row) return null;
  return [
    "code" => $row["code"] ?? "",
    "name" => $row["name"] ?? "",
    "phone" => $row["phone"] ?? "",
    "email" => $row["email"] ?? "",
    "note" => $row["note"] ?? "",
    "source" => $row["source"] ?? "",
    "createdAt" => $row["createdAt"] ?? "",
  ];
}

function moggys_public_state($now = null) {
  if ($now === null) $now = new DateTimeImmutable("now", new DateTimeZone("Asia/Tokyo"));
  $slots = [];
  $readable = true;
  try {
    $slots = moggys_read_slots();
  } catch (MoggysReservationException $error) {
    $readable = false;
  }
  $live = moggys_durable() && $readable;
  $days = [];
  foreach (moggys_days() as $day) {
    $items = [];
    foreach (moggys_times() as $time) {
      $row = $slots[moggys_slot_key($day["date"], $time)] ?? null;
      $status = moggys_slot_view($day["date"], $time, $row, $now, $live);
      $items[] = [
        "time" => $time,
        "end" => moggys_end_label($time),
        "status" => $status === "closed" ? "taken" : $status,
      ];
    }
    $days[] = [
      "date" => $day["date"],
      "heading" => $day["heading"],
      "ja" => $day["ja"],
      "slots" => $items,
    ];
  }
  return [
    "accepting" => $live && !moggys_event_ended($now),
    "ended" => moggys_event_ended($now),
    "days" => $days,
  ];
}

function moggys_admin_state($now = null) {
  if ($now === null) $now = new DateTimeImmutable("now", new DateTimeZone("Asia/Tokyo"));
  $slots = moggys_read_slots();
  $live = moggys_durable();
  $days = [];
  foreach (moggys_days() as $day) {
    $items = [];
    foreach (moggys_times() as $time) {
      $row = $slots[moggys_slot_key($day["date"], $time)] ?? null;
      $items[] = [
        "time" => $time,
        "end" => moggys_end_label($time),
        "status" => moggys_slot_view($day["date"], $time, $row, $now, true),
        "booking" => moggys_public_booking($row),
      ];
    }
    $days[] = [
      "date" => $day["date"],
      "heading" => $day["heading"],
      "ja" => $day["ja"],
      "slots" => $items,
    ];
  }
  return [
    "durable" => $live,
    "accepting" => $live && !moggys_event_ended($now),
    "ended" => moggys_event_ended($now),
    "days" => $days,
  ];
}

function moggys_reservation_payload($booking) {
  $day = moggys_day_by_date($booking["date"]);
  return [
    "code" => $booking["code"],
    "date" => $booking["date"],
    "time" => $booking["time"],
    "end" => moggys_end_label($booking["time"]),
    "ja" => $day ? $day["ja"] : $booking["date"],
    "cancelToken" => $booking["cancelToken"],
  ];
}

function moggys_client_ip() {
  $ip = $_SERVER["REMOTE_ADDR"] ?? "";
  return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : "unknown";
}

function moggys_rate_allow($bucket, $limit, $windowSeconds) {
  $key = $bucket . "|" . moggys_client_ip();
  $now = time();
  return moggys_locked(moggys_rate_file(), true, function ($rows) use ($key, $limit, $windowSeconds, $now) {
    $fresh = [];
    foreach ($rows as $rowKey => $stamps) {
      if (!is_array($stamps)) continue;
      $kept = [];
      foreach ($stamps as $stamp) {
        if ($now - (int) $stamp < $windowSeconds) $kept[] = (int) $stamp;
      }
      if ($kept) $fresh[$rowKey] = $kept;
    }
    $mine = $fresh[$key] ?? [];
    if (count($mine) >= $limit) {
      $fresh[$key] = $mine;
      return ["write" => $fresh, "return" => false];
    }
    $mine[] = $now;
    $fresh[$key] = $mine;
    return ["write" => $fresh, "return" => true];
  });
}

function moggys_password_ok($given) {
  $config = moggys_config();
  $hash = (string) ($config["admin_password_hash"] ?? "");
  if ($hash === "") return false;
  return password_verify((string) $given, $hash);
}

function moggys_password_configured() {
  $config = moggys_config();
  return (string) ($config["admin_password_hash"] ?? "") !== "";
}
