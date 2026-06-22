# Pipeline artifacts

Stage order: keywords → candidates → selected → cards → media → news_data → axbrief-data.js

## keywords.json (기획)
{ "date":"YYYY-MM-DD", "categories":[ {"category":"figma","queries":["..."],"allowed_domains":["figma.com"]} ] }

## candidates.json (사서)
{ "date":"YYYY-MM-DD","window_hours":24,
  "items":[ {"url":"","source":"","category":"figma","published_iso":"2026-06-22T03:00:00Z","og_image":"","excerpt":""} ] }

## selected.json (선별)
{ "date":"YYYY-MM-DD",
  "picks":[ {"url":"","source":"","tool":"Figma","accent":"#0070f3","motif":"frame","rationale":"","published_iso":"","og_image":"","excerpt":""} ] }
# exactly 5 picks (or fewer if fewer fresh)

## cards.json (라이터)
{ "date":"YYYY-MM-DD",
  "cards":[ {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"한 줄\n또는 두 줄","body":"1~2문장.","mini_headline":"덱용 짧은 헤드라인","source":"Figma","url":"","accent":"#0070f3","motif":"frame"} ] }

## media.json (미디어)
{ "date":"YYYY-MM-DD",
  "media":[ {"id":"figma","type":"image","src":"pipeline/media/figma.jpg"} ] }
# type: "image" -> src is a downloaded file path; "svg" -> no src (page renders motif scene)

## news_data.json (source of truth, rolled by 발행)
{ "today": {"date":"YYYY-MM-DD","cards":[<full card incl. optional image>]},
  "days":  [ {"date":"YYYY-MM-DD","cards":[{"tool","headline","source","url","accent"}]} ] }
