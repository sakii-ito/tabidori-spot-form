/* ============================================================
   ここから下がJavaScript（画面を「動かす」部分）だ。
   CSSは見た目だけだったが、JSは
   「ボタンを押したら〇〇する」「入力されたデータを保存する」
   のような“動き”を担当している。

   (function(){ ... })();  という形は「無名関数を今すぐ実行する」という
   おまじないのような書き方で、IIFE（即時実行関数）と呼ばれる。
   これで囲むことで、中で作った変数が外のコードとぶつからないようにしている。
   ============================================================ */
(function(){
  // ===== データの保存先 =====
  // localStorage: このブラウザの中だけにデータを保存する小さな保管場所
  // サーバーではないので、別のパソコン・ブラウザには引き継がれない
  const STORAGE_KEY = "tabidori_spots_v9"; // 10/22: 사전예매를 입장료처럼 토글 방식으로 변경(advanceKnown 추가)해서 v9로 올림
  const GOAL = 60; // 目標のスポット数

  // 保存されているデータを読み込む（なければ空の配列）
  function loadSpots(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : []; // JSON.parse: 文字列 → 配列/オブジェクトに戻す
    }catch(e){ return []; }
  }
  // データを保存する（配列 → 文字列に変換して保存）
  function saveSpots(spots){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(spots)); } // JSON.stringify: 配列 → 文字列に変換
    catch(e){ showToast("저장에 실패했어요"); }
  }

  // ----- ページが開かれた瞬間に用意しておく「状態(今の値)」-----
  // spots: これまで保存した全スポットの配列（リスト）。ページを開いた時点の保存データが入る
  let spots = loadSpots();
  // selectedDays: 今チェックが入っている定休日の配列。例: ["월","화"]
  let selectedDays = [];
  // selectedTags: 今チェックが入っているタグの配列。例: ["야경","포토스팟"]
  let selectedTags = [];
  // feeOn: 入場料スイッチが今ON(有料)かOFF(無料)かを覚えておく変数
  let feeOn = false;
  // advanceOn: 10/22追加。事前予約スイッチが今ON(가능)かOFF(모름)かを覚えておく変数
  let advanceOn = false;
  // editingId: 10/23追加。今「修正中」のスポットのid。nullなら新規追加モード
  let editingId = null;

  // document.getElementById("〇〇") は、HTML側で id="〇〇" と書いた部品を
  // JSから取ってきて変数に入れる、という意味だ。以後この変数越しに操作する。
  const listArea = document.getElementById("listArea");   // 保存済みスポット一覧を表示するエリア
  const toastEl = document.getElementById("toast");         // 下に出るお知らせのボックス
  const routeFill = document.getElementById("routeFill");   // 進捗バーの緑色の部分
  const routePin = document.getElementById("routePin");     // 進捗バーの上を動くピンのアイコン
  const routeCount = document.getElementById("routeCount"); // "3 / 60" のような文字

  // ===== 文字をそのままHTMLに埋め込むと危険な記号(<,>など)を無害な文字に変換する関数 =====
  // 例えばユーザーが名前に <script> みたいな文字を入れても、
  // そのままHTMLに差し込むと変な動きをしてしまう可能性があるため、
  // &lt; のような「文字実体参照」に変換して安全に表示できるようにしている。
  function escapeHtml(s){
    // s || "" : sが未入力(undefined/null)だったら空文字にする
    // .replace(正規表現, 関数) : 対象の記号を見つけるたびに、対応する安全な文字に置き換える
    return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  // ===== 画面下に「담았어요！」のようなお知らせを一瞬だけ出す関数 =====
  function showToast(msg){
    toastEl.textContent = msg;             // お知らせの文字を差し替える
    toastEl.classList.add("show");          // CSSの.show(表示用)クラスを付けてフワッと表示
    // 1700ミリ秒(1.7秒)後に自動でクラスを外して、お知らせを消す
    setTimeout(()=>toastEl.classList.remove("show"), 1700);
  }

  // ===== 「今何件集まったか」の進捗バーを更新する関数 =====
  // 保存件数を変える操作（追加・削除）のたびに毎回呼び出している
  function renderProgress(){
    // 達成率(%)を計算。100を超えないように Math.min(100, ...) でストッパーをかけている
    const pct = Math.min(100, Math.round((spots.length/GOAL)*100));
    routeFill.style.width = pct + "%";   // バーの緑色の幅をパーセントに合わせて伸ばす
    routePin.style.left = pct + "%";     // ピンのアイコンも同じ位置まで移動させる
    routeCount.textContent = spots.length + " / " + GOAL; // "12 / 60" のような文字に更新
    renderMap(); // 11/03追加: 件数が変わる時は地図も一緒に描き直す
  }

  // ===== 11/03追加: 47都道府県のデータ =====
  // [正式名(プルダウン・保存用), 地図のマスに出す短い名前, 列(x), 行(y)]
  // x・y は地図のマス目の位置。北海道が右上、沖縄が左下になるように並べている
  const PREFS = [
    ["홋카이도","홋카이도",12,0],
    ["아오모리현","아오모리",12,1],
    ["아키타현","아키타",11,2],["이와테현","이와테",12,2],
    ["이시카와현","이시카와",8,3],["도야마현","도야마",9,3],["니가타현","니가타",10,3],["야마가타현","야마가타",11,3],["미야기현","미야기",12,3],
    ["후쿠이현","후쿠이",8,4],["기후현","기후",9,4],["나가노현","나가노",10,4],["군마현","군마",11,4],["후쿠시마현","후쿠시마",12,4],
    ["야마구치현","야마구치",2,5],["시마네현","시마네",3,5],["돗토리현","돗토리",4,5],["효고현","효고",5,5],["교토부","교토",6,5],["시가현","시가",7,5],
    ["아이치현","아이치",8,5],["시즈오카현","시즈오카",9,5],["야마나시현","야마나시",10,5],["사이타마현","사이타마",11,5],["도치기현","도치기",12,5],["이바라키현","이바라키",13,5],
    ["사가현","사가",0,6],["후쿠오카현","후쿠오카",1,6],["히로시마현","히로시마",3,6],["오카야마현","오카야마",4,6],["오사카부","오사카",5,6],["나라현","나라",6,6],["미에현","미에",7,6],
    ["가나가와현","가나가와",10,6],["도쿄도","도쿄",11,6],["지바현","지바",12,6],
    ["나가사키현","나가사키",0,7],["구마모토현","구마모토",1,7],["오이타현","오이타",2,7],["에히메현","에히메",3,7],["가가와현","가가와",4,7],["와카야마현","와카야마",6,7],
    ["가고시마현","가고시마",1,8],["미야자키현","미야자키",2,8],["고치현","고치",3,8],["도쿠시마현","도쿠시마",4,8],
    ["오키나와현","오키나와",0,10]
  ];

  // プルダウン(<select id="f-pref">)の選択肢を、PREFS配列から47個まとめて作る
  const prefSelect = document.getElementById("f-pref");
  PREFS.forEach(p=>{
    const opt = document.createElement("option");
    opt.value = p[0]; opt.textContent = p[0];
    prefSelect.appendChild(opt);
  });

  // ===== 11/03追加: 都道府県タイルマップを描く関数 =====
  function renderMap(){
    // ① 都道府県ごとの件数を数える。例: {"도쿄도":2, "가나가와현":2}
    const counts = {};
    spots.forEach(s=>{ if(s.prefecture) counts[s.prefecture] = (counts[s.prefecture]||0) + 1; });

    // ② 47マスを作る。件数によってクラス(lv1/lv2)を変えて色を付ける
    document.getElementById("prefMap").innerHTML = PREFS.map(p=>{
      const n = counts[p[0]] || 0;
      const lv = n >= 2 ? " lv2" : (n === 1 ? " lv1" : "");
      return '<div class="pref-tile'+lv+'" data-pref="'+p[0]+'" title="'+p[0]+' '+n+'개" '+
             'style="grid-column:'+(p[2]+1)+';grid-row:'+(p[3]+1)+';">'+
             '<span>'+p[1]+'</span>'+(n?'<span class="n">'+n+'</span>':'')+'</div>';
    }).join("");

    // ③ 上の「○ / 47」と、まだ0件の都道府県リストを更新
    const filled = PREFS.filter(p=>counts[p[0]]).length;
    document.getElementById("mapCount").textContent = filled + " / 47";
    const missing = PREFS.filter(p=>!counts[p[0]]).map(p=>p[1]);
    document.getElementById("mapMissing").innerHTML = missing.length
      ? '<b>아직 없는 곳 ('+missing.length+')</b> '+missing.join(" · ")
      : '<b>🎉 47개 도도부현 전부 채웠어요!</b>';

    // ④ 都道府県が入っていない昔のスポットがあれば、赤字で知らせる（✎で直してもらう）
    const noPref = spots.filter(s=>!s.prefecture).length;
    document.getElementById("mapWarn").textContent = noPref
      ? "⚠ 도도부현이 비어있는 스팟이 "+noPref+"개 있어요. 아래 목록에서 ✎로 수정해주세요"
      : "";

    // ⑤ マスをクリックすると、その都道府県のスポット名をお知らせで出す
    document.querySelectorAll(".pref-tile").forEach(tile=>{
      tile.addEventListener("click", ()=>{
        const pref = tile.getAttribute("data-pref");
        const names = spots.filter(s=>s.prefecture===pref).map(s=>s.name);
        showToast(pref+": "+(names.length ? names.join(", ") : "아직 없어요"));
      });
    });
  }

  // ===== 保存したスポット一覧を画面に描く =====
  // spots配列を1件ずつチケット風のカードHTMLに変換して、全部つなげて表示する
  // JSでは「HTMLの文字列」を自分で組み立てて innerHTML に入れることで、
  // 画面に新しい部品を表示する、というやり方をよく使う。
  function renderList(){
    // まだ1件も保存されていない時は「空っぽメッセージ」だけ出して終了
    if(spots.length === 0){
      listArea.innerHTML = '<div class="empty">아직 모은 스팟이 없어요. 위 양식으로 첫 스팟을 담아보세요 :)</div>';
      return; // ここで関数を抜ける（これ以降の処理はやらない）
    }
    // spots.slice() : 元の配列を壊さずコピーを作る（.reverse()で順番を変えるため）
    // .reverse() : 新しく追加した物が「一番上」に表示されるように順番を逆にする
    // .map(s => ...) : spots配列の1件ずつ(s)を、下のHTML文字列に変換していく
    listArea.innerHTML = spots.slice().reverse().map(s => {
      // 画像URLが入力されていれば<img>タグを作る。無ければ空文字（＝何も表示しない）
      // onerror="..." は、画像の読み込みに失敗した時(リンク切れなど)に
      // 自動で非表示にする保険の処理だ
      const img = s.image ? '<img class="ticket-img" src="'+escapeHtml(s.image)+'" alt="" onerror="this.style.display=\'none\'">' : "";

      // rows: カードの中に表示する「情報の行」を1つずつ追加していく配列
      // 値が入力されている項目だけ rows.push(...) で追加するので、
      // 空欄の項目はカードに表示されない仕組みになっている
      const rows = [];
      if(s.address) rows.push('<span><b>주소</b> '+escapeHtml(s.address)+(s.area?' ('+escapeHtml(s.area)+')':'')+'</span>');
      if(s.prefecture) rows.push('<span><b>도도부현</b> '+escapeHtml(s.prefecture)+'</span>'); // 11/03追加
      // 위도/경도가 둘 다 있으면, 그 자리에서 구글맵 링크를 바로 만들어서 보여준다.
      // (map_url을 따로 저장 안 하고, lat/lng으로부터 즉석에서 링크를 조립하는 방식)
      if(s.lat && s.lng){
        const mapLink = "https://www.google.com/maps?q="+encodeURIComponent(s.lat)+","+encodeURIComponent(s.lng);
        rows.push('<span><b>지도</b> <a href="'+mapLink+'" target="_blank" rel="noopener">구글맵에서 보기</a></span>');
      }
      if(s.station) rows.push('<span><b>역</b> '+escapeHtml(s.station)+(s.walk?' · 도보 '+escapeHtml(s.walk)+'분':'')+'</span>');
      if(s.openTime || s.closeTime) rows.push('<span><b>시간</b> '+escapeHtml(s.openTime||'?')+' ~ '+escapeHtml(s.closeTime||'?')+'</span>');
      if(s.closedDays && s.closedDays.length) rows.push('<span><b>휴무</b> '+s.closedDays.join(', ')+'</span>');
      if(s.desc) rows.push('<span>'+escapeHtml(s.desc)+'</span>');
      // 入場料が有料(s.fee===true)で、チケット情報が1件以上ある時だけ、
      // チケットの種類ごと(平日券・休日券など)に1行ずつ金額を表示する
      if(s.fee && s.tickets && s.tickets.length){
        s.tickets.forEach(t=>{
          const label = t.label ? escapeHtml(t.label) : "입장료";
          // yen: 金額が入っていれば「1000円」のように円マークを付け、
          //       未入力なら "-" を表示する小さなヘルパー関数
          const yen = v => v ? v+"円" : "-";
          rows.push('<span><b>'+label+'</b> 성인 '+yen(t.adult)+' · 청소년 '+yen(t.teen)+' · 노인 '+yen(t.senior)+' · 어린이 '+yen(t.child)+'</span>');
        });
      }
      if(s.feeNote) rows.push('<span><b>요금 비고</b> '+escapeHtml(s.feeNote)+'</span>');
      // 10/22추가: 사전예매 토글이 켜져있으면 카드에도 표시 (개월수 있으면 숫자, 없으면 "확인 필요")
      if(s.advanceKnown) rows.push('<span><b>사전예매</b> '+(s.advance?escapeHtml(s.advance)+'개월 전부터 가능':'가능(개월수 확인 필요)')+'</span>');
      // 11/11추가: 사전예매 참고사항(발매일, 구매처 등 텍스트)도 카드에 표시
      if(s.advanceKnown && s.advanceNote) rows.push('<span><b>사전예매 참고</b> '+escapeHtml(s.advanceNote)+'</span>');
      // 「정보 재확인 필요」にチェックが入っていたら、赤文字の注意書きを追加
      if(s.needsCheck) rows.push('<span style="color:var(--danger)">⚠ 정보 재확인 필요</span>');
      if(s.home) rows.push('<span><b>홈페이지</b> <a href="'+escapeHtml(s.home)+'" target="_blank" rel="noopener">열기</a></span>');
      if(s.noticeUrl) rows.push('<span><b>공지URL</b> <a href="'+escapeHtml(s.noticeUrl)+'" target="_blank" rel="noopener">열기</a></span>');
      if(s.placeId) rows.push('<span><b>Place ID</b> '+escapeHtml(s.placeId)+'</span>');
      if(s.imageCredit) rows.push('<span><b>이미지 출처</b> '+escapeHtml(s.imageCredit)+'</span>');
      // タグ(야경・포토스팟など)を、ひとつずつ小さいシール風のHTMLに変換して連結
      const tags = (s.tags||[]).map(t=>'<span class="sticker">'+escapeHtml(t)+'</span>').join("");

      // 上で作ったパーツ(rows, tags, img)を全部組み合わせて、
      // 1件分のチケットカードのHTMLを完成させて返す
      return (
        '<div class="ticket" data-id="'+s.id+'">' +            // data-id に保存時のIDを入れておく（削除の時に使う）
          '<div class="ticket-main">' +
            '<div class="ticket-top">' +
              '<span class="ticket-name">'+escapeHtml(s.name)+(s.nameJa?' <small style="opacity:.6;">('+escapeHtml(s.nameJa)+')</small>':'')+'</span>' +
              '<span class="ticket-cat">'+escapeHtml(s.category)+'</span>' +
            '</div>' +
            '<div class="ticket-meta">'+rows.join("")+'</div>' +   // 上で集めたrowsを1つの文字列にして差し込む
            (tags ? '<div class="ticket-tags">'+tags+'</div>' : '') +
            img +
          '</div>' +
          '<div class="ticket-stub">' +
            '<button type="button" class="edit-btn" data-edit="'+s.id+'" aria-label="수정">✎</button>' +
            '<button type="button" data-del="'+s.id+'" aria-label="삭제">✕</button>' +
          '</div>' +
        '</div>'
      );
    }).join(""); // .map()で作った文字列の配列を、全部つなげて1つの大きなHTML文字列にする

    // 今画面に表示されている「削除(✕)」ボタン全部に、1つずつクリックイベントを付ける
    // （カードは毎回まるごと作り直されるので、このイベント設定もrenderList()が呼ばれるたびに
    //   最初からやり直している、という点がポイントだ）
    listArea.querySelectorAll("[data-del]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-del"); // どのカードの削除ボタンか、IDを取得
        // 10/23追加: 間違ってタップしてもすぐ消えないように、一回確認を挟む
        // confirm()はブラウザ標準の「はい/いいえ」ダイアログ。「いいえ」を押すとfalseが返るので、そのまま処理を止める
        if(!confirm("이 스팟을 삭제할까요? 되돌릴 수 없어요")) return;
        // spots配列から「IDが一致しないものだけ」を残す → 結果的にそのIDの物だけ消える
        spots = spots.filter(s=>String(s.id)!==String(id));
        saveSpots(spots);   // 削除した後の状態をlocalStorageに保存
        renderList();       // 一覧を再描画（削除されたカードが消えた状態になる）
        renderProgress();   // 件数が変わったので進捗バーも更新
        showToast("삭제했어요");
      });
    });

    // 10/23追加: 「✎」(修正)ボタン全部にクリックイベントを付ける
    listArea.querySelectorAll("[data-edit]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-edit");
        const target = spots.find(s=>String(s.id)===String(id)); // 編集対象のスポットを探す
        if(target) startEdit(target);
      });
    });
  }

  // ===== 定休日ボタン（トグル方式） =====
  // クリックするたびに「選択済みなら外す／未選択なら入れる」を繰り返すだけのシンプルな仕組み
  // document.querySelectorAll(".day-chip") で、月〜日の7つのボタンを全部まとめて取得し、
  // forEach で1つずつ同じ処理（クリックイベントの設定）を付けていく
  document.querySelectorAll(".day-chip").forEach(chip=>{
    chip.addEventListener("click", ()=>{
      // HTML側に書いた data-day="월" のような値を取り出す
      const day = chip.getAttribute("data-day");
      if(selectedDays.includes(day)){
        // すでに選択済みリストに入っている → 押すと「選択を外す」
        selectedDays = selectedDays.filter(d=>d!==day); // dayと一致しないものだけ残す＝dayを除外
        chip.classList.remove("on"); // 見た目も元の色に戻す
      }else{
        // まだ選択されていない → 押すと「選択リストに追加する」
        selectedDays.push(day);
        chip.classList.add("on"); // 見た目を緑色(ON)に変える
      }
    });
  });

  // ===== タグボタン（曜日ボタンと同じトグル方式） =====
  // 「분위기·뷰」「계절·이벤트」など4グループ分のタグボタンを、
  // グループに関係なく全部まとめて1回で処理している
  document.querySelectorAll('.chip-row[data-group="tags"] .chip').forEach(chip=>{
    chip.addEventListener("click", ()=>{
      const val = chip.textContent; // ボタンに書かれている文字そのもの（例:"야경"）をタグの値として使う
      if(selectedTags.includes(val)){
        selectedTags = selectedTags.filter(t=>t!==val); // すでにあれば外す
        chip.classList.remove("on");
      }else{
        selectedTags.push(val); // なければ追加する
        chip.classList.add("on");
      }
    });
  });

  // ===== 入場料セクション =====
  const feeSwitch = document.getElementById("feeSwitch");     // 有料/無料のON-OFFスイッチ本体
  const feeFields = document.getElementById("feeFields");     // スイッチONの時だけ見える料金入力エリア全体
  const feeLabel = document.getElementById("feeLabel");       // "무료"/"유료" という表示の文字
  const ticketRows = document.getElementById("ticketRows");   // チケット種類の入力欄が入っている箱
  const addTicketBtn = document.getElementById("addTicketBtn"); // "＋ 티켓 종류 추가" ボタン

  // 「＋ チケット種類を追加」ボタンを押すたびに、この関数で入力欄のまとまりを
  // ひとつ新しく作って画面に追加する（平日券・休日券など複数チケット対応）
  // data を渡した場合は、その値を最初から入力欄にセットしておく（今回は空のまま呼ぶだけだが、
  // 将来「編集機能」を作る時に既存データを入れ直せるように用意してある）
  function addTicketRow(data){
    data = data || {}; // dataが渡されなかった場合は空オブジェクトにしておく（エラー防止）

    const row = document.createElement("div"); // ① まだ何も入っていない空のdiv要素を新しく作る
    row.className = "ticket-row";               // ② CSSの .ticket-row のデザインを適用するクラス名を付ける
    // ③ そのdivの中身(innerHTML)に、1種類のチケット分の入力欄(名前・성인・청소년・노인・어린이)を
    //    HTML文字列として丸ごと書き込む。文字列を+でつないで組み立てている
    row.innerHTML =
      '<button type="button" class="ticket-row-remove" aria-label="이 티켓 삭제">✕</button>' +
      '<div class="grid">' +
        '<div class="field full">' +
          '<label>티켓 이름</label>' +
          '<input type="text" class="t-label" placeholder="예: 평일권, 주말권, 성수기권">' +
        '</div>' +
        '<div class="field"><label>성인</label><input type="number" class="t-adult" min="0" placeholder="円"></div>' +
        '<div class="field"><label>청소년</label><input type="number" class="t-teen" min="0" placeholder="円"></div>' +
        '<div class="field"><label>노인</label><input type="number" class="t-senior" min="0" placeholder="円"></div>' +
        '<div class="field"><label>어린이</label><input type="number" class="t-child" min="0" placeholder="円"></div>' +
        // 10/24追加: 이 티켓만의 이용가능 시간대/구역 제한 등을 적는 선택 메모칸
        '<div class="field full"><label>이용 제한 메모 (선택)</label><input type="text" class="t-note" placeholder="예: 16:00 이후 입장 가능 / 아쿠아뮤지엄・우미팜만 이용 가능"></div>' +
      '</div>';
    // ④ data(もし値があれば)の内容を、作った入力欄に流し込む。無ければ空文字("")のまま
    row.querySelector(".t-label").value = data.label || "";
    row.querySelector(".t-adult").value = data.adult || "";
    row.querySelector(".t-teen").value = data.teen || "";
    row.querySelector(".t-senior").value = data.senior || "";
    row.querySelector(".t-child").value = data.child || "";
    row.querySelector(".t-note").value = data.note || ""; // 10/24追加
    // ⑤ このチケット行専用の削除(✕)ボタンにクリック処理を付ける
    row.querySelector(".ticket-row-remove").addEventListener("click", ()=>{
      row.remove(); // この行だけを画面から取り除く
      // 全部消して0件になった場合は、空欄が1つも無い状態を避けるため
      // 自動的に新しい空の行を1つ作っておく（常に最低1行は表示される）
      if(ticketRows.children.length === 0) addTicketRow();
    });
    ticketRows.appendChild(row); // ⑥ 完成した行を、画面上のticketRowsという箱の中に実際に追加する
  }
  // ===== チケット入力欄を「最初の状態（1行だけ空っぽ）」に戻す関数 =====
  // フォーム送信後や、新しく入力をやり直す時に呼ばれる
  function resetTicketRows(){
    ticketRows.innerHTML = ""; // 今ある行を全部消す（空文字を入れると中身が空になる）
    addTicketRow();            // 空の行を1つだけ新しく作る
  }
  // ===== 画面に出ているすべてのチケット入力欄を集めて、配列（リスト）にまとめる関数 =====
  // フォーム送信時に呼ばれて「結局何種類のチケットが入力されたか」をまとめて取得する
  function collectTickets(){
    // Array.from(...) : querySelectorAllの結果(特殊な形)を、ふつうの配列に変換する
    // .map(row => ({...})) : 行(row)1つずつから、各入力欄の値を取り出してオブジェクトに変換
    return Array.from(ticketRows.querySelectorAll(".ticket-row")).map(row => ({
      label: row.querySelector(".t-label").value.trim(),  // .trim()で前後の余計な空白を削除
      adult: row.querySelector(".t-adult").value,
      teen: row.querySelector(".t-teen").value,
      senior: row.querySelector(".t-senior").value,
      child: row.querySelector(".t-child").value,
      note: row.querySelector(".t-note").value.trim() // 10/24追加: 이용 제한 메모
    // .filter(...) : 名前も金額も全部空っぽの行(何も入力されていない行)は結果から除外する
    })).filter(t => t.label || t.adult || t.teen || t.senior || t.child || t.note);
  }
  addTicketBtn.addEventListener("click", ()=>addTicketRow()); // ボタンを押したら新しい行を1つ追加

  // ===== 有料/無料のスイッチを切り替える関数 =====
  function toggleFee(){
    feeOn = !feeOn; // 今の反対の値にする（trueならfalseに、falseならtrueに）
    feeSwitch.classList.toggle("on", feeOn);     // feeOnがtrueなら.onを付け、falseなら外す
    feeFields.classList.toggle("show", feeOn);   // 料金入力エリアの表示/非表示も同じように切り替える
    feeLabel.textContent = feeOn ? "유료" : "무료"; // 文字も合わせて変更
    // ONにした瞬間、まだ1件も入力欄が無ければ最初の1行を自動で用意する
    if(feeOn && ticketRows.children.length === 0) addTicketRow();
  }
  feeSwitch.addEventListener("click", toggleFee); // マウスでクリックした時
  // キーボードでEnterキーかスペースキーを押した時も、クリックと同じ動作にする
  // （マウスが使えない人でも操作できるようにするための配慮：アクセシビリティ対応）
  feeSwitch.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggleFee(); }});
  resetTicketRows(); // ページを開いた最初の時点で、空のチケット行を1つ表示しておく

  // ===== 事前予約セクション（10/22追加） =====
  // 入場料スイッチと全く同じ仕組み：スイッチON(가능)の時だけ詳細入力欄を見せる
  const advanceSwitch = document.getElementById("advanceSwitch");
  const advanceFields = document.getElementById("advanceFields");
  const advanceLabel = document.getElementById("advanceLabel");
  function toggleAdvance(){
    advanceOn = !advanceOn;
    advanceSwitch.classList.toggle("on", advanceOn);
    advanceFields.classList.toggle("show", advanceOn);
    advanceLabel.textContent = advanceOn ? "사전예매 가능" : "사전예매 모름";
  }
  advanceSwitch.addEventListener("click", toggleAdvance);
  advanceSwitch.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggleAdvance(); }});

  const form = document.getElementById("spotForm");
  const formError = document.getElementById("formError");
  const submitBtn = document.getElementById("submitBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn"); // 10/23追加: 修正モードをやめるボタン

  // ===== フォームを「空っぽの新規追加モード」に戻す関数（10/23追加） =====
  // 送信成功した後と、修正をキャンセルした時の両方から呼ばれる共通処理
  function resetFormState(){
    form.reset();
    selectedDays = [];
    selectedTags = [];
    feeOn = false;
    advanceOn = false;
    document.querySelectorAll(".day-chip.on, .chip.on").forEach(c=>c.classList.remove("on"));
    feeSwitch.classList.remove("on");
    feeFields.classList.remove("show");
    feeLabel.textContent = "무료";
    advanceSwitch.classList.remove("on");
    advanceFields.classList.remove("show");
    advanceLabel.textContent = "사전예매 모름";
    resetTicketRows();
    editingId = null;                               // 修正モードも解除する
    submitBtn.textContent = "+ 다이어리에 담기";
    cancelEditBtn.style.display = "none";
  }

  // ===== 「✎」ボタンを押した時、フォームに既存のデータを流し込んで修正モードに入る関数（10/23追加） =====
  function startEdit(s){
    document.getElementById("f-name-ko").value = s.name || "";
    document.getElementById("f-name-ja").value = s.nameJa || "";
    document.getElementById("f-placeid").value = s.placeId || "";
    document.getElementById("f-cat").value = s.category || "관광지";
    document.getElementById("f-desc").value = s.desc || "";
    document.getElementById("f-addr").value = s.address || "";
    document.getElementById("f-area").value = s.area || "";
    document.getElementById("f-pref").value = s.prefecture || ""; // 11/03追加
    document.getElementById("f-lat").value = s.lat || "";
    document.getElementById("f-lng").value = s.lng || "";
    document.getElementById("f-station").value = s.station || "";
    document.getElementById("f-walk").value = s.walk || "";
    document.getElementById("f-open").value = s.openTime || "";
    document.getElementById("f-close").value = s.closeTime || "";
    document.getElementById("f-hoursnote").value = s.hoursNote || "";
    document.getElementById("f-parking").value = s.parking || "";
    document.getElementById("f-needscheck").checked = !!s.needsCheck;
    document.getElementById("f-feenote").value = s.feeNote || "";
    document.getElementById("f-home").value = s.home || "";
    document.getElementById("f-notice").value = s.noticeUrl || "";
    document.getElementById("f-img").value = s.image || "";
    document.getElementById("f-imgcredit").value = s.imageCredit || "";

    // 정기 휴무 요일: 기존 선택을 다시 칩에 반영
    selectedDays = (s.closedDays||[]).slice();
    document.querySelectorAll(".day-chip").forEach(chip=>{
      chip.classList.toggle("on", selectedDays.includes(chip.getAttribute("data-day")));
    });

    // 태그: 기존 선택을 다시 칩에 반영
    selectedTags = (s.tags||[]).slice();
    document.querySelectorAll('.chip-row[data-group="tags"] .chip').forEach(chip=>{
      chip.classList.toggle("on", selectedTags.includes(chip.textContent));
    });

    // 입장료 스위치 + 티켓 목록 복원
    feeOn = !!s.fee;
    feeSwitch.classList.toggle("on", feeOn);
    feeFields.classList.toggle("show", feeOn);
    feeLabel.textContent = feeOn ? "유료" : "무료";
    ticketRows.innerHTML = ""; // 일단 비우고
    if(feeOn && s.tickets && s.tickets.length){
      s.tickets.forEach(t=>addTicketRow(t)); // 기존 티켓들을 하나씩 다시 그림
    }else{
      addTicketRow(); // 티켓이 없으면 빈 행 1개만
    }

    // 사전예매 스위치 복원
    advanceOn = !!s.advanceKnown;
    advanceSwitch.classList.toggle("on", advanceOn);
    advanceFields.classList.toggle("show", advanceOn);
    advanceLabel.textContent = advanceOn ? "사전예매 가능" : "사전예매 모름";
    document.getElementById("f-advance").value = s.advance || "";
    document.getElementById("f-advance-note").value = s.advanceNote || ""; // 11/11추가

    editingId = s.id;                               // 이제부터 "수정 모드"
    submitBtn.textContent = "✎ 수정 완료";
    cancelEditBtn.style.display = "inline-block";
    formError.style.display = "none";
    form.scrollIntoView({behavior:"smooth"});        // 폼이 화면에 보이게 스크롤
  }
  cancelEditBtn.addEventListener("click", resetFormState); // 취소 누르면 그냥 새 입력 모드로 돌아감

  // ===== 「＋ 다이어리에 담기」ボタン(フォーム送信)を押したときの処理 =====
  // 全体の流れ：
  //   ① 名前が入力されているかチェック（必須項目なので）
  //   ② 画面の全部の入力欄から値を集めて、1つのオブジェクト(entry)にまとめる
  //   ③ entryをspots配列に追加する
  //   ④ localStorageに保存する
  //   ⑤ 画面(一覧・進捗バー)を描き直す
  //   ⑥ フォームを空っぽに戻して、次の1件を入力しやすくする
  form.addEventListener("submit", e=>{
    e.preventDefault(); // ページの再読み込みを止める（フォームのデフォルト動作をキャンセル）

    // ----- ① 必須項目（スポット名・도도부현・지역）のチェック -----
    // 11/23修正: 위도・경도는 선택 항목으로 변경 (11/18 규칙: Wikidata에 없는 작은 장소는 비워둬도 됨)
    // 10/23追加: ラベルには必須(*)と書いてあるのに、実際はname以外チェックしてなかったバグを修正
    const name = document.getElementById("f-name-ko").value.trim();
    const area = document.getElementById("f-area").value.trim();
    const pref = document.getElementById("f-pref").value; // 11/03追加
    const lat = document.getElementById("f-lat").value.trim();
    const lng = document.getElementById("f-lng").value.trim();
    // requiredChecks: [値, エラーメッセージ, フォーカスを戻すid] の組み合わせを順番にチェックする配列
    const requiredChecks = [
      [name, "스팟 이름은 꼭 입력해주세요", "f-name-ko"],
      [pref, "도도부현을 선택해주세요", "f-pref"],
      [area, "지역(에어리어)은 꼭 입력해주세요", "f-area"]
    ];
    // find(...) : 配列を順番に見ていって、値(checkItem[0])が空っぽの最初の項目を探す
    const firstMissing = requiredChecks.find(checkItem => !checkItem[0]);
    if(firstMissing){
      // 空っぽの項目があったら、エラー文を表示してここで処理を止める（これ以降に進まない）
      formError.textContent = firstMissing[1];
      formError.style.display = "block";
      document.getElementById(firstMissing[2]).focus(); // その入力欄に自動でカーソルを戻す
      return; // 関数をここで終了。下のentry作成には進まない
    }
    // 11/23追加: 위도・경도는 선택이 됐지만, 한쪽만 입력하면 좌표로 쓸 수 없으니 막는다
    if((lat && !lng) || (!lat && lng)){
      formError.textContent = "위도와 경도는 둘 다 입력하거나, 둘 다 비워주세요";
      formError.style.display = "block";
      document.getElementById(lat ? "f-lng" : "f-lat").focus();
      return;
    }
    formError.style.display = "none"; // チェックを通ったので、前回出ていたエラー文は隠す

    // ----- ② 画面の各入力欄から値を取り出して、1つのオブジェクトにまとめる -----
    // document.getElementById("f-〇〇").value で、その入力欄に今入っている文字を取得できる
    const entry = {
      // id: 修正モード（editingId有り）なら元のidをそのまま使い続ける。
      //     新規追加モードなら、今この瞬間の時刻(Date.now())＋ランダムな文字をくっつけて、
      //     ほぼ確実に世界で1つだけのユニークな値を新しく作る（10/23: 修正モード対応で分岐追加）
      id: editingId || (Date.now()+"_"+Math.random().toString(36).slice(2,7)),
      name: name,
      nameJa: document.getElementById("f-name-ja").value.trim(),
      placeId: document.getElementById("f-placeid").value.trim(),
      category: document.getElementById("f-cat").value,          // プルダウンで選んだカテゴリ
      desc: document.getElementById("f-desc").value.trim(),
      address: document.getElementById("f-addr").value.trim(),
      prefecture: pref,  // 11/03追加: 도도부현
      area: area,       // 10/15 추가: 지역명(교토/아사쿠사 등). 10/23: 위에서 검증에 쓴 변수 그대로 재사용
      lat: lat,                  // 10/15 추가: 위도 (map_url 대신)
      lng: lng,                  // 10/15 추가: 경도 (map_url 대신)
      station: document.getElementById("f-station").value.trim(),
      walk: document.getElementById("f-walk").value,
      openTime: document.getElementById("f-open").value,
      closeTime: document.getElementById("f-close").value,
      hoursNote: document.getElementById("f-hoursnote").value.trim(),
      // closedDays: 月〜日ボタンで選んだ曜日の配列。.slice()でコピーを入れることで、
      //             後でselectedDaysを空にしても、保存済みのこのentryの内容は影響を受けない
      closedDays: selectedDays.slice(),
      advanceKnown: advanceOn,                      // 10/22追加: 사전예매 가능 여부 자체(토글 상태)
      advance: advanceOn ? document.getElementById("f-advance").value : "",
      advanceNote: advanceOn ? document.getElementById("f-advance-note").value.trim() : "", // 11/11추가: 사전예매 관련 참고사항
      parking: document.getElementById("f-parking").value,
      // needsCheck: 체크박스를 직접 눌렀거나, "사전예매 가능"인데 몇개월인지 비워뒀으면 자동으로 true
      // (10/22: 입장료처럼 "켜놨는데 상세가 없으면 재확인 필요로 알려주기" 로직 추가)
      needsCheck: document.getElementById("f-needscheck").checked
        || (advanceOn && !document.getElementById("f-advance").value)
        || !lat || !lng,   // 11/23추가: 좌표가 비어있으면 나중에 채워야 하니 재확인 필요로 표시
      fee: feeOn,                                   // 入場料スイッチが今ONかOFFか
      tickets: feeOn ? collectTickets() : [],        // ONの時だけ、入力されたチケット情報を集める。OFFなら空配列
      feeNote: document.getElementById("f-feenote").value.trim(), // 연령 기준 비고（10/16: 스팟 전체 1개로 원복）
      tags: selectedTags.slice(),                    // タグも同様にコピーして保存
      home: document.getElementById("f-home").value.trim(),
      noticeUrl: document.getElementById("f-notice").value.trim(),
      image: document.getElementById("f-img").value.trim(),
      imageCredit: document.getElementById("f-imgcredit").value.trim() // 10/15 추가: 이미지 출처/저작권자
    };

    // ----- ③④⑤ 配列に追加（または更新）して保存し、画面を更新する -----
    // 10/23追加: editingIdがあれば「新規追加」じゃなくて「既存の項目を更新」に分岐する
    if(editingId){
      const idx = spots.findIndex(s=>String(s.id)===String(editingId)); // 修正対象が配列の何番目にあるか探す
      if(idx !== -1){ spots[idx] = entry; } // 見つかったら、その場所をentryで丸ごと置き換える
      saveSpots(spots);
      renderList();
      renderProgress();
      showToast("수정했어요"); // 新規追加とは違う文言のお知らせ
    }else{
      spots.push(entry);     // spots配列の一番最後にentryを追加
      saveSpots(spots);       // localStorageに今の状態をまるごと保存
      renderList();            // 一覧表示を作り直す（新しいカードが増えた状態で再描画）
      renderProgress();         // 件数が増えたので進捗バーも更新
      showToast("담았어요! 현재 "+spots.length+"개"); // 「담았어요！現在〇〇個」のお知らせを出す
    }

    // ----- ⑥ フォームを初期状態にリセットして、次の入力に備える -----
    // 10/23: リセット処理はresetFormState()にまとめた（修正キャンセル時と共通で使うため）
    resetFormState();
    document.getElementById("f-name-ko").focus(); // 次の入力がすぐできるよう、名前欄にカーソルを戻す
  });

  // ===== 1つの値を「CSVのルールに合った文字」に変換する関数 =====
  // CSVはカンマ(,)で項目を区切る形式なので、値の中にカンマや改行、"が
  // そのまま入っているとズレてしまう。それを防ぐための変換だ。
  function toCsvField(v){
    const s = String(v==null ? "" : v); // null/undefinedは空文字に、それ以外は文字列に変換
    // 値の中に " か , か 改行 が含まれていたら、全体を""で囲み、中の"は""に二重化する
    // （これはExcelなどが使う標準的なCSVのルールだ）
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }
  // ===== CSVエクスポート =====
  // 保存したデータをExcelで開けるCSV（カンマ区切り）形式の文字列に変換して
  // ファイルとしてダウンロードする
  async function exportCsv(){
    // 1件も保存されていない場合は、空のファイルを作る意味が無いので早めに終了
    if(spots.length === 0){ showToast("내보낼 데이터가 없어요"); return; }

    // headers: CSVの1行目（見出し行）。この並び順と、下のrowsで作る値の並び順を必ず揺らさないように揃える
    // 10/16: 티켓마다로 옮겼다가, 입력부담 커서 다시 스팟 전체 1개(연령비고 열)로 원복함
    // 10/22: place_id 열 삭제 (핵심 기능에 안 쓰이고 입력부담만 커서)
    // 10/22: 사전예매 가능여부(사전예매가능)와 개월수(사전예매개월)를 분리해서 열 추가
    // 11/11추가: 사전예매 참고사항(사전예매비고) 열 추가
    // 11/17추가: 사용 안 하는 체류분(체류 목안 시간) 열 삭제
    // 11/18추가: 일본어이름, placeid, 공지URL 열 추가 (현우 피드백 반영)
    const headers = ["한국어이름","일본어이름","placeid","카테고리","소개","주소","도도부현","지역","위도","경도","최근역","도보분","영업시작","영업종료","예외사항","휴무요일","사전예매가능","사전예매개월","사전예매비고","주차장","재확인필요","입장료유무","티켓종류별요금","연령비고","태그","홈페이지","공지URL","이미지","이미지출처"];

    // spots配列を1件ずつ「CSVの1行分の文字列」に変換していく
    const rows = spots.map(s => {
      // 複数あるチケット種類を、1つのセルの中に "라벨(성인1000/청소년800/...); 라벨2(...)" のように
      // セミコロン(;)区切りでまとめて1つの文字列にする（CSVは1マスに1個の値しか入れられないため）
      // 10/24追加: 티켓마다 이용 제한 메모(t.note)가 있으면 "/메모:..."로 같이 이어붙인다
      const ticketStr = (s.tickets||[]).map(t =>
        (t.label||"기본")+"(성인"+(t.adult||"-")+"/청소년"+(t.teen||"-")+"/노인"+(t.senior||"-")+"/어린이"+(t.child||"-")+(t.note ? "/메모:"+t.note : "")+")"
      ).join("; ");
      // 配列の中に、headersと同じ順番で値を並べる
      return [
        s.name, s.nameJa, s.placeId, s.category, s.desc, s.address, s.prefecture, s.area, s.lat, s.lng, s.station, s.walk,
        s.openTime, s.closeTime, s.hoursNote, (s.closedDays||[]).join("/"),
        s.advanceKnown ? "Y":"N", s.advance, s.advanceNote, s.parking,
        s.needsCheck ? "Y":"N", s.fee ? "Y":"N", ticketStr, s.feeNote,
        (s.tags||[]).join("/"), s.home, s.noticeUrl, s.image, s.imageCredit
      // .map(toCsvField) で各値をCSV用に安全な形に変換 → .join(",") でカンマ区切りの1行の文字列にする
      ].map(toCsvField).join(",");
    });

    // 見出し行 + データの行たちを改行でつないで、CSVファイル全体の文字列を完成させる。
    // 先頭の "\uFEFF"（目には見えない文字、BOMという）は、Excelで開いた時に
    // 韓国語・日本語の文字が文字化けしないようにするためのおまじないだ
    // 11/02修正: 見えない文字を直接書くと、コピペの時に消えたり化けたりするので "\uFEFF" という書き方に変更（意味は同じ）
    const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    // 10/23追加: ファイル名に日付を入れて、前に出したCSVを上書きしないようにする
    // 例: 2026-10-29 → "20261029"
    const today = new Date();
    const pad2 = n => String(n).padStart(2, "0"); // 1桁の数字の前に0を付ける（9→09）
    const dateStr = today.getFullYear() + pad2(today.getMonth()+1) + pad2(today.getDate());
    const filename = "tabidori_spots_"+dateStr+".csv";
    try{
      // 10/29修正: ローカルファイル(index.htmlをダブルクリックで開いた場合)と
      // Claude Artifact(claude.ai上の公開ページ)とでは、ダウンロードの仕組みが違う。
      // ・ローカル → 普通のブラウザなので、Blob+<a download>という標準のやり方でそのままダウンロードできる
      // ・Artifact → ページがサンドボックス(制限された箱)の中にあるので、標準のやり方が使えず、
      //              claude.use("downloads")という特別な橋渡し機能が必要
      // typeof claude === "undefined" かどうかで、今どっちの環境にいるか判定して分岐する
      if(typeof claude === "undefined"){
        // ----- ローカルファイルの場合: ブラウザ標準のダウンロード方法 -----
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob); // Blob(データのかたまり)に、一時的な仮のURLを発行する
        const a = document.createElement("a"); // 見えない<a>タグ(リンク)を1つ作って
        a.href = url;
        a.download = filename; // download属性をつけると、クリックした時にページ遷移じゃなくファイル保存になる
        document.body.appendChild(a);
        a.click();              // 自動でクリックしたことにして、ダウンロードを発生させる
        document.body.removeChild(a); // 使い終わった見えないリンクは掃除する
        URL.revokeObjectURL(url);     // 仮のURLも後片付け
        showToast("CSV로 저장했어요");
        return;
      }
      // ----- Claude Artifactの場合: 特別な橋渡し機能を使う -----
      const downloads = await claude.use("downloads");
      if(!downloads){ showToast("이 화면에서는 다운로드를 쓸 수 없어요"); return; }
      await downloads.save({ filename: filename, data: csv });
      showToast("CSV로 저장했어요");
    }catch(err){
      // ユーザーがダウンロードの確認ダイアログで「キャンセル」した場合は、
      // エラーのお知らせを出さずに静かに終わる
      if(err && err.code === "declined") return;
      showToast("다운로드에 실패했어요");
    }
  }
  // "CSV로 내보내기" ボタンが押されたら、上のexportCsv関数を実行する
  document.getElementById("exportBtn").addEventListener("click", exportCsv);

  // ============================================================
  // 10/30追加: SQLiteファイルとして保存・読み込みする機能
  // CSVは「見るだけ」の表だが、こっちは本物のデータベースファイル(.sqlite)。
  // DB Browser for SQLiteみたいなツールで直接開けるし、팀원한테 공유하기도 좋다。
  // ============================================================

  let SQL = null; // sql.jsの本体。最初に使う時に1回だけ読み込んで、ここに覚えておく(毎回読み込むと遅いから)
  async function getSQL(){
    if(!SQL){
      // initSqlJs: ライブラリ本体(sql-wasm.js)とは別に、実際の計算をするsql-wasm.wasmという
      // ファイルも必要なので、それをどこから取ってくるか(locateFile)を教えてあげる
      SQL = await initSqlJs({
        locateFile: file => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/" + file
      });
    }
    return SQL;
  }

  // 11/02追加: 空欄はnull(値なし)に、それ以外は本物の数字に変換する関数
  // ""(空文字)のまま数字の列に入れると、SQLiteは「文字」として保存してしまうため
  // 例: "1000" → 1000 / "" → null
  const toNum = v => (v === "" || v == null) ? null : Number(v);
  // 11/02追加: DBから読み込んだ数字を、フォーム用の文字に戻す関数
  // 数字の0のままだと、フォームの「data.adult || ""」で空欄扱いになって消えてしまうため
  // 例: 0 → "0" / null → ""
  const toStr = v => v == null ? "" : String(v);

  // ----- 保存: 今のspots配列を、ERD通りの2つの表(curation_spots / admission_tickets)に
  //            組み立て直して、1個の.sqliteファイルとしてダウンロードする -----
  async function exportDb(){
    if(spots.length === 0){ showToast("내보낼 데이터가 없어요"); return; }
    try{
      const SQLmod = await getSQL();
      const db = new SQLmod.Database();
      // CURATION_SPOTS 표(ERD v10과 동일한 구조)
      // 11/02修正: 위도/경도는 REAL(소수), 도보분・사전예매개월은 INTEGER(정수)로 변경
      //           (TEXT로 저장하면 정렬이나 "3000엔 이하" 같은 검색이 제대로 안 되기 때문)
      // 11/17: 사용 안 하는 duration(체류 목안 시간) 열 삭제
      // 11/18: 현우 피드백 반영 — name_ja(일본어이름), place_id, notice_url(공지URL) 열 추가
      db.run(
        "CREATE TABLE curation_spots (" +
        "id TEXT PRIMARY KEY, name TEXT, name_ja TEXT, place_id TEXT, category TEXT, description TEXT, address TEXT, prefecture TEXT, area TEXT, " +
        "latitude REAL, longitude REAL, nearest_station TEXT, walk_minutes INTEGER, " +
        "open_time TEXT, close_time TEXT, hours_note TEXT, closed_days TEXT, " +
        "advance_booking_known INTEGER, advance_booking_months INTEGER, advance_booking_note TEXT, " + // 11/11: 사전예매 참고사항 열 추가
        "parking TEXT, needs_check INTEGER, " +
        "admission_fee INTEGER, admission_note TEXT, tags TEXT, " +
        "homepage_url TEXT, notice_url TEXT, image_url TEXT, image_credit TEXT)"
      );
      // ADMISSION_TICKETS 표
      // 11/02修正: 요금 4개(성인/청소년/노인/어린이)는 INTEGER(정수)로 변경
      db.run(
        "CREATE TABLE admission_tickets (" +
        "id TEXT PRIMARY KEY, spot_id TEXT, label TEXT, " +
        "price_adult INTEGER, price_teen INTEGER, price_senior INTEGER, price_child INTEGER, ticket_note TEXT)"
      );
      const insertSpot = db.prepare(
        "INSERT INTO curation_spots VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)" // 11/18: name_ja/place_id/notice_url 추가로 29개
      );
      const insertTicket = db.prepare(
        "INSERT INTO admission_tickets VALUES (?,?,?,?,?,?,?,?)"
      );
      spots.forEach(s=>{
        insertSpot.run([
          String(s.id), s.name||"", s.nameJa||"", s.placeId||"",     // 11/18: name_ja/place_id 추가
          s.category||"", s.desc||"", s.address||"", s.prefecture||"", s.area||"",  // 11/03: prefecture 추가
          toNum(s.lat), toNum(s.lng), s.station||"", toNum(s.walk),   // 11/02: 숫자로 변환
          s.openTime||"", s.closeTime||"", s.hoursNote||"", (s.closedDays||[]).join("/"),
          s.advanceKnown?1:0, toNum(s.advance), s.advanceNote||"",    // 11/11: 사전예매 참고사항 추가
          s.parking||"", s.needsCheck?1:0,                            // 11/17: duration 삭제
          s.fee?1:0, s.feeNote||"", (s.tags||[]).join("/"),
          s.home||"", s.noticeUrl||"", s.image||"", s.imageCredit||""  // 11/18: notice_url 추가
        ]);
        (s.tickets||[]).forEach(t=>{
          insertTicket.run([
            String(s.id)+"_"+Math.random().toString(36).slice(2,8), String(s.id),
            t.label||"", toNum(t.adult), toNum(t.teen), toNum(t.senior), toNum(t.child), t.note||""  // 11/02: 요금을 숫자로 변환
          ]);
        });
      });
      insertSpot.free();
      insertTicket.free();
      const data = db.export(); // Uint8Array(ファイルの中身そのもの)に変換
      db.close();
      const blob = new Blob([data], { type:"application/x-sqlite3" });
      const today = new Date();
      const pad2 = n => String(n).padStart(2,"0");
      const dateStr = today.getFullYear()+pad2(today.getMonth()+1)+pad2(today.getDate());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "tabidori_spots_"+dateStr+".sqlite";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("SQLite 파일로 저장했어요");
    }catch(err){
      console.error(err);
      showToast("SQLite 저장에 실패했어요 (인터넷 연결을 확인해주세요)");
    }
  }

  // ----- 読み込み: .sqliteファイルを選んでもらって、中身を今のspots配列に置き換える -----
  async function importDb(file){
    try{
      const SQLmod = await getSQL();
      const buf = await file.arrayBuffer();
      const db = new SQLmod.Database(new Uint8Array(buf));
      const spotRows = db.exec("SELECT * FROM curation_spots");
      const ticketRows = db.exec("SELECT * FROM admission_tickets");
      db.close();
      if(spotRows.length === 0){ showToast("이 파일엔 스팟 데이터가 없어요"); return; }
      const cols = spotRows[0].columns;
      const newSpots = spotRows[0].values.map(row=>{
        const obj = {};
        cols.forEach((c,i)=>{ obj[c]=row[i]; });
        return {
          id: obj.id, name: obj.name, nameJa: obj.name_ja || "", placeId: obj.place_id || "",  // 11/18추가
          category: obj.category, desc: obj.description,
          address: obj.address, prefecture: obj.prefecture || "", area: obj.area, lat: toStr(obj.latitude), lng: toStr(obj.longitude),  // 11/02: 숫자→문자
          station: obj.nearest_station, walk: toStr(obj.walk_minutes),                                 // 11/02: 숫자→문자
          openTime: obj.open_time, closeTime: obj.close_time, hoursNote: obj.hours_note,
          closedDays: obj.closed_days ? obj.closed_days.split("/").filter(Boolean) : [],
          advanceKnown: !!obj.advance_booking_known, advance: toStr(obj.advance_booking_months),       // 11/02: 숫자→문자
          advanceNote: obj.advance_booking_note || "",                                                 // 11/11추가
          parking: obj.parking, needsCheck: !!obj.needs_check,          // 11/17: duration 삭제
          fee: !!obj.admission_fee, feeNote: obj.admission_note,
          tags: obj.tags ? obj.tags.split("/").filter(Boolean) : [],
          home: obj.homepage_url, noticeUrl: obj.notice_url || "", image: obj.image_url, imageCredit: obj.image_credit,  // 11/18추가: notice_url
          tickets: []
        };
      });
      if(ticketRows.length){
        const tcols = ticketRows[0].columns;
        ticketRows[0].values.forEach(row=>{
          const obj = {};
          tcols.forEach((c,i)=>{ obj[c]=row[i]; });
          const target = newSpots.find(s=>String(s.id)===String(obj.spot_id));
          if(target){
            // 11/02: 요금도 숫자→문자로 되돌림 (0엔이 사라지지 않게)
            target.tickets.push({ label:obj.label, adult:toStr(obj.price_adult), teen:toStr(obj.price_teen), senior:toStr(obj.price_senior), child:toStr(obj.price_child), note:obj.ticket_note });
          }
        });
      }
      if(!confirm("SQLite 파일을 불러오면 지금 화면의 데이터("+spots.length+"개)가 전부 교체돼요. 계속할까요?")) return;
      spots = newSpots;
      saveSpots(spots);
      renderList();
      renderProgress();
      showToast(spots.length+"개 불러왔어요");
    }catch(err){
      console.error(err);
      showToast("SQLite 파일을 읽는 데 실패했어요");
    }
  }

  document.getElementById("exportDbBtn").addEventListener("click", exportDb);
  document.getElementById("importDbBtn").addEventListener("click", ()=>{
    document.getElementById("importDbInput").click();
  });
  document.getElementById("importDbInput").addEventListener("change", (e)=>{
    const file = e.target.files[0];
    if(file) importDb(file);
    e.target.value = ""; // 같은 파일을 다시 선택해도 change 이벤트가 뜨게 초기화
  });

  // ===== ページが最初に開かれた時に、1回だけ実行する処理 =====
  // localStorageに前回のデータが残っていれば、それをすぐ画面に反映させるために
  // 一覧(renderList)と進捗バー(renderProgress)を1回描いておく
  renderList();
  renderProgress();
})();
