// ─── I18N (TH / EN) ──────────────────────────────────────────────────────────
// Default: Thai ('th'), persisted in localStorage under 'tt_lang'.
// Universal trading terms (Win Rate, Profit Factor, P&L, Long/Short, Entry/Exit, R:R, SL/TP)
// stay in English in Thai mode for natural modern trader readability.
(function () {
  'use strict';

  const LANG_KEY = 'tt_lang';

  const DICT = {
    th: {
      // Loading & Auth
      'common.loading': 'กำลังโหลด...',
      'common.cancel': 'ยกเลิก',
      'common.confirm': 'ยืนยัน ▸',
      'common.close': 'ปิด',
      'common.save': 'บันทึก ▸',
      'common.create': 'สร้างพอร์ต ▸',
      'common.apply': 'บันทึกค่า ▸',
      'common.none': 'ไม่มี',
      'common.langToggle': 'สลับภาษา TH / EN',
      'common.langLabel': 'ภาษา: ไทย (TH)',
      'common.langShort': 'TH',

      'auth.tagline': 'TRACK YOUR RETIREMENT',
      'auth.loginTitle': 'เข้าสู่ระบบ',
      'auth.registerTitle': 'สมัครสมาชิก',
      'auth.email': 'อีเมล (EMAIL)',
      'auth.password': 'รหัสผ่าน (PASSWORD)',
      'auth.emailPh': 'trader@email.com',
      'auth.loginBtn': 'เข้าสู่ระบบ ▸',
      'auth.registerBtn': 'สร้างบัญชีใหม่ ▸',
      'auth.loadingBtn': 'กำลังดำเนินการ...',
      'auth.forgot': 'ลืมรหัสผ่าน?',
      'auth.noAccount': 'ยังไม่มีบัญชี?',
      'auth.hasAccount': 'มีบัญชีแล้ว?',
      'auth.registerLink': 'สมัครสมาชิก',
      'auth.loginLink': 'เข้าสู่ระบบ',
      'auth.errCaptcha': 'กรุณายืนยัน CAPTCHA (Turnstile) ก่อน',
      'auth.errRequired': 'กรุณาใส่ email และ password',
      'auth.errInvalidEmail': 'Email ไม่ถูกต้อง',
      'auth.errEmailFormat': 'รูปแบบ email ไม่ถูกต้อง',
      'auth.errPassLen': 'Password ต้องมีอย่างน้อย 6 ตัวอักษร',
      'auth.errLogin': 'Email หรือ Password ไม่ถูกต้อง',
      'auth.errForgotEmail': 'กรุณาใส่ email ก่อนแล้วกดลืมรหัสผ่าน',
      'auth.okSignup': 'สมัครสมาชิกสำเร็จ! ✓ กรุณาเช็ค email เพื่อยืนยัน',
      'auth.okReset': 'ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ email แล้ว ✓',
      'auth.waitCooldown': 'กรุณารออีก {s} วินาที',

      // 3D Intro
      'intro.loading': 'กำลังโหลดอินโทร 3D',
      'intro.skip': 'ข้ามอินโทร',
      'intro.skipAria': 'ข้ามอินโทรและเข้าสู่แดชบอร์ด',
      'intro.scroll': 'เลื่อนลงเพื่อเข้าสู่ระบบ',
      'intro.enter': 'เข้าสู่แดชบอร์ด',
      'intro.heroTitle': 'กุมความได้เปรียบ เหนือทุกจังหวะ',
      'intro.heroSub': 'ที่ที่ทุกออเดอร์กลายเป็นข้อมูล และทุกการตัดสินใจกลายเป็นความได้เปรียบของคุณ',
      'intro.ch1Name': 'บันทึก',
      'intro.ch1Tag': '<b>01</b>บันทึกเทรด',
      'intro.ch1Title': 'ทุกออเดอร์ ถูกบันทึกไว้อย่างแม่นยำ',
      'intro.ch1Desc': 'บันทึก Entry, Exit, Size และเหตุผลในการเข้าได้ในไม่กี่วินาที ระบบช่วยจำสิ่งที่อารมณ์อาจทำคุณลืม',
      'intro.ch2Name': 'ความเสี่ยง',
      'intro.ch2Tag': '<b>02</b>บริหารความเสี่ยง',
      'intro.ch2Title': 'คุมความเสี่ยง เหนือความผันผวน',
      'intro.ch2Desc': 'กำหนด Risk ก่อนเข้าออเดอร์ คำนวณขนาดพอร์ตแบบเรียลไทม์ ไม่ปล่อยให้เสียงรบกวนของตลาดตัดสินแทนคุณ',
      'intro.ch3Name': 'ผลตอบแทน',
      'intro.ch3Tag': '<b>03</b>Asymmetric Returns',
      'intro.ch3Title': 'คิดเป็นค่า R ไม่ใช่แค่ตัวเงิน',
      'intro.ch3Desc': 'หยุดไล่ตามตัวเลข แล้วหันมาวัดผลจาก Execution เข้าใจความได้เปรียบที่แท้จริงผ่าน Risk-to-Reward',
      'intro.ch4Name': 'เจาะลึก',
      'intro.ch4Tag': '<b>04</b>Audit การเทรด',
      'intro.ch4Title': 'เจาะลึกทุกมิติของการเทรด',
      'intro.ch4Desc': 'เปิดเผยแพตเทิร์นที่ซ่อนอยู่ วิเคราะห์ Win Rate, Profit Factor และค่าความคาดหวังทางสถิติที่แท้จริง',
      'intro.ch5Name': 'บัญชีพอร์ต',
      'intro.ch5Tag': '<b>05</b>จัดการหลายพอร์ต',
      'intro.ch5Title': 'ระบบเดียว เชื่อมครบทุกพอร์ต',
      'intro.ch5Desc': 'รวมพอร์ตส่วนตัว, Prop Firm และ Crypto ไว้ในที่เดียว สลับดูและติดตามผลได้อย่างไร้รอยต่อ',
      'intro.ch6Name': 'ภาพรวม',
      'intro.ch6Tag': '<b>06</b>ภาพรวมพอร์ต',
      'intro.ch6Title': 'เห็นภาพรวมทั้งหมด จบในหน้าเดียว',
      'intro.ch6Desc': 'กราฟ Equity Curve, ปฏิทิน Heatmap, สถิติ Streak และอันดับ Symbol อัปเดตทันทีที่คุณบันทึกออเดอร์',
      'intro.liveChapter': 'บทที่ {i} จาก {n}: {name}',
      'intro.jumpChapter': 'ข้ามไปยังบทที่ {i}: {name}',

      // Nav Rail & Mobile Tabbar & More Sheet
      'nav.dashboard': 'ภาพรวม',
      'nav.dashboardTitle': 'ภาพรวม Dashboard',
      'nav.journal': 'บันทึกเทรด',
      'nav.journalTitle': 'สมุดบันทึกเทรดทั้งหมด',
      'nav.heatmap': 'Heatmap',
      'nav.heatmapTitle': 'ปฏิทินกำไร-ขาดทุน (Heatmap)',
      'nav.analytics': 'วิเคราะห์ผล',
      'nav.analyticsTitle': 'วิเคราะห์ผลและสถิติ',
      'nav.settings': 'ตั้งค่า',
      'nav.settingsTitle': 'ตั้งค่าพอร์ตโฟลิโอ',
      'nav.intro': 'อินโทร 3D',
      'nav.introTitle': 'ดูอินโทร 3D อีกครั้ง',
      'nav.themeTitle': 'สลับธีม มืด / สว่าง',
      'nav.logout': 'ออกจากระบบ',
      'nav.more': 'เพิ่มเติม',
      'nav.newTradeAria': 'บันทึกออเดอร์ใหม่',
      'nav.portfolioSettings': 'ตั้งค่าพอร์ต',
      'nav.tickerSettings': 'ตั้งค่าแถบข่าว FX',
      'nav.switchTheme': 'สลับธีม มืด / สว่าง',
      'nav.replayIntro': 'ดูอินโทร 3D อีกครั้ง',

      // Header
      'header.searchPh': 'ค้นหา Symbol, Setup, Tag...',
      'header.searchAria': 'ค้นหาออเดอร์',
      'header.tickerTitle': 'ตั้งค่าแถบข่าว FX สด',

      // Stats Cards & Hero Equity
      'stats.totalPnl': 'TOTAL P&L',
      'stats.winRate': 'WIN RATE',
      'stats.profitFactor': 'PROFIT FACTOR',
      'stats.bestTrade': 'BEST TRADE',
      'stats.onInitial': 'เทียบทุนเริ่มต้น',
      'stats.vs50': 'เทียบ 50% · {w}W / {l}L',
      'stats.avgWinLoss': 'เฉลี่ยกำไร / เฉลี่ยขาดทุน',
      'stats.worstTrade': 'ออเดอร์ที่แย่สุด',

      'equity.balanceLabel': 'ยอดเงินพอร์ตรวม (PORTFOLIO BALANCE)',
      'equity.allTime': 'ทั้งหมด',
      'equity.month': 'เดือนนี้',
      'equity.week': 'สัปดาห์นี้',
      'equity.last30d': '30 วันล่าสุด',
      'equity.extendTitle': 'ขยายเต็มจอ',
      'equity.statTotalPnl': 'TOTAL P&L',
      'equity.statWinRate': 'WIN RATE',
      'equity.statMaxDD': 'MAX DRAWDOWN',
      'equity.statTrades': 'จำนวนเทรด',
      'equity.growthTrend': 'แนวโน้มเติบโต',
      'equity.benchmarkBase': 'เงินทุนเริ่มต้น',
      'equity.tooltipEquity': 'Equity',

      // Heatmap
      'hmap.tag': 'PERFORMANCE MATRIX',
      'hmap.title': 'Trading P&L Heatmap',
      'hmap.prevMonth': 'เดือนก่อนหน้า',
      'hmap.nextMonth': 'เดือนถัดไป',
      'hmap.lossDay': 'วันขาดทุน',
      'hmap.noTrade': 'ไม่มีเทรด',
      'hmap.profitDay': 'วันกำไร',
      'hmap.days': ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'],
      'hmap.tradesWord': 'เทรด',
      'hmap.cleared': 'ล้างตัวกรองวันที่แล้ว',
      'hmap.filtered': 'กรองรายการวันที่ {date}',
      'hmap.showingAll': 'แสดงรายการเทรดทั้งหมด',

      // Analytics
      'ana.tag': 'EXECUTION INTELLIGENCE',
      'ana.title': 'Win / Loss & Symbol',
      'ana.symPerf': 'ผลประกอบการราย Symbol',
      'ana.win': 'WIN',
      'ana.loss': 'LOSS',
      'ana.grossProfit': 'กำไรรวม (GROSS PROFIT)',
      'ana.grossLoss': 'ขาดทุนรวม (GROSS LOSS)',
      'ana.noData': 'ยังไม่มีข้อมูล',
      'ana.curWinStreak': 'WIN STREAK ปัจจุบัน',
      'ana.curLossStreak': 'LOSS STREAK ปัจจุบัน',
      'ana.curStreak': 'STREAK ปัจจุบัน',
      'ana.bestStreak': 'สถิติสูงสุด: {n} {type}',
      'ana.winsPlural': 'WIN ติดกัน',
      'ana.lossesPlural': 'LOSS ติดกัน',

      // Accounts / Portfolios
      'acc.tag': 'MY PORTFOLIOS',
      'acc.title': 'บัญชีเทรด (Accounts)',
      'acc.newBtn': '+ สร้างพอร์ต',
      'acc.newBtnTitle': 'เพิ่มพอร์ตโฟลิโอใหม่',
      'acc.activeTag': 'กำลังใช้งาน',
      'acc.balanceLabel': 'ยอดเงินในบัญชี (BALANCE)',
      'acc.newTrade': '+ บันทึกเทรดใหม่',
      'acc.importCsvTitle': 'นำเข้าจากไฟล์ CSV',
      'acc.exportCsvTitle': 'ส่งออกเป็นไฟล์ CSV',
      'acc.settingsTitle': 'ตั้งค่าพอร์ต',
      'acc.extTitle': 'บัญชีเทรดทั้งหมดที่เชื่อมต่อ',
      'acc.extDesc': 'จัดการยอดเงิน ดู Win Rate และสลับระหว่างพอร์ตส่วนตัว, Prop Firm หรือ Demo ได้ทันที',
      'acc.extCreate': '+ สร้างพอร์ตใหม่',
      'acc.curActive': '● กำลังใช้งาน',
      'acc.subAccount': 'บัญชีย่อย',
      'acc.netPnl': 'NET P&L',
      'acc.returnLbl': 'RETURN',
      'acc.winRateLbl': 'WIN RATE',
      'acc.tradesCount': '({n} เทรด)',
      'acc.switchBtn': 'สลับบัญชี',
      'acc.activeBadge': '✓ ใช้งานอยู่',

      // Recent Trades & Journal
      'trd.tag': 'LIVE EXECUTION',
      'trd.title': 'ออเดอร์ล่าสุด',
      'trd.viewAll': 'ดูทั้งหมด →',
      'trd.all': 'ทั้งหมด',
      'trd.long': 'LONG',
      'trd.short': 'SHORT',
      'trd.wins': 'WIN',
      'trd.losses': 'LOSS',
      'trd.emptyCompact': 'ยังไม่มีบันทึกการเทรด',
      'trd.extTitle': 'รายการออเดอร์และตรวจสอบเชิงลึก',
      'trd.extDesc': 'ตรวจสอบรายละเอียดออเดอร์ย้อนหลังครบทุกคอลัมน์ในคลิกเดียว',
      'trd.backOverview': '← กลับหน้าภาพรวม',
      'trd.fullJournal': 'สมุดบันทึกการเทรดทั้งหมด',
      'trd.newTradeBtn': '+ บันทึกเทรดใหม่',
      'trd.emptyTable': 'ไม่พบรายการเทรด',
      'trd.emptyCta': '+ บันทึกเทรดแรก',
      'trd.emptyExt': 'ไม่พบรายการเทรดที่ตรงกับตัวกรองปัจจุบัน',
      'trd.emptyFeed': 'ไม่พบรายการเทรด {suffix}',
      'trd.emptyFeedDate': 'ในวันที่ {date}',
      'trd.emptyFeedFilter': 'ตามตัวกรองปัจจุบัน',
      'trd.resetBtn': '✕ รีเซ็ต',
      'trd.resetTitle': 'แสดงรายการเทรดทั้งหมด',
      'trd.clickDetails': 'คลิกเพื่อดูรายละเอียดของ {sym}',
      'trd.orderDetailsTitle': 'รายละเอียดออเดอร์',
      'trd.inspectTitle': 'ตรวจสอบรายละเอียดออเดอร์',
      'trd.inspectBtn': '••• ตรวจสอบ',
      'trd.units': 'units',
      'trd.noTag': 'ไม่มี Tag',
      'trd.noNote': 'ยังไม่มีบันทึกสำหรับออเดอร์นี้',
      'trd.balAfterTitle': 'ยอดเงินหลังจบออเดอร์',
      'trd.editTitle': 'แก้ไข',
      'trd.deleteTitle': 'ลบ',
      'trd.prevPage': '◀ ก่อนหน้า',
      'trd.nextPage': 'ถัดไป ▶',
      'trd.pageOf': 'หน้า {cur} จาก {total}',
      'trd.extModeToast': 'โหมดขยายเต็มจอ',

      // Table Columns
      'col.date': 'วันที่',
      'col.sym': 'SYMBOL',
      'col.dir': 'ทิศทาง',
      'col.entry': 'ENTRY',
      'col.exit': 'EXIT',
      'col.size': 'SIZE',
      'col.pnl': 'P&L',
      'col.pnlUsd': 'P&L (USD)',
      'col.pct': '%',
      'col.returnPct': 'RETURN %',
      'col.r': 'R',
      'col.setup': 'SETUP',
      'col.tag': 'TAG',
      'col.action': 'จัดการ',

      // Add / Edit Trade Modal
      'mdl.newTrade': 'บันทึกออเดอร์ใหม่',
      'mdl.editTrade': 'แก้ไขออเดอร์',
      'mdl.saveTrade': 'บันทึกออเดอร์ ▸',
      'mdl.symbol': 'SYMBOL (คู่เทรด)',
      'mdl.symOther': 'OTHER (พิมพ์เอง)...',
      'mdl.symCustomPh': 'เช่น BTCUSD',
      'mdl.contractSize': 'Contract size: {label}',
      'mdl.date': 'วันที่',
      'mdl.dir': 'ทิศทาง (DIRECTION)',
      'mdl.entry': 'ENTRY PRICE',
      'mdl.exit': 'EXIT PRICE',
      'mdl.sl': 'STOP LOSS (SL)',
      'mdl.tp': 'TAKE PROFIT (TP)',
      'mdl.optional': 'ไม่บังคับ',
      'mdl.size': 'POSITION SIZE',
      'mdl.portBalance': 'เงินทุนพอร์ต (BALANCE)',
      'mdl.setupNotes': 'SETUP / บันทึกเพิ่มเติม',
      'mdl.setupPh': 'Breakout, Support bounce, Trend follow...',
      'mdl.tag': 'TAG',
      'mdl.estPnl': 'คาดการณ์ P&L',
      'mdl.dist': 'ระยะ',
      'mdl.points': 'Points',
      'mdl.accGrowth': 'พอร์ตโต',
      'mdl.riskPort': 'ของพอร์ต',
      'mdl.slRule': 'SL ต้องอยู่{side}ราคา Entry สำหรับฝั่ง {dir}',
      'mdl.slRuleSave': 'Stop Loss ต้องอยู่{side}ราคา Entry สำหรับฝั่ง {dir}',
      'mdl.below': 'ต่ำกว่า',
      'mdl.above': 'สูงกว่า',
      'mdl.noPortfolio': 'ไม่มีพอร์ต — กรุณาสร้างพอร์ตก่อน',
      'mdl.fillRequired': 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ',
      'mdl.updated': 'อัปเดตออเดอร์แล้ว ✓',
      'mdl.saved': 'บันทึกออเดอร์แล้ว ✓',
      'mdl.confirmDelTrade': 'ต้องการลบออเดอร์นี้ใช่ไหม?',
      'mdl.deleted': 'ลบออเดอร์แล้ว',

      // Order Details Modal
      'dtl.badge': 'ตรวจสอบออเดอร์ (INSPECTOR)',
      'dtl.netPnl': 'กำไร-ขาดทุนสุทธิ (NET REALIZED P&L)',
      'dtl.returnR': '{pct} Return • {r}',
      'dtl.date': 'วันที่เทรด',
      'dtl.size': 'POSITION SIZE',
      'dtl.entry': 'ENTRY PRICE',
      'dtl.exit': 'EXIT PRICE',
      'dtl.sl': 'STOP LOSS',
      'dtl.tp': 'TAKE PROFIT',
      'dtl.r': 'ACTUAL R-MULTIPLE',
      'dtl.tag': 'กลยุทธ์ / TAG',
      'dtl.notes': 'SETUP / บันทึกการเทรด',
      'dtl.delBtn': '🗑 ลบออเดอร์',
      'dtl.editBtn': '✏ แก้ไข',

      // Notion Export Modal
      'notion.title': 'ส่งออกข้อมูลไป NOTION',
      'notion.desc': 'คัดลอก → เปิด Notion → สร้าง Table → Ctrl+V วางได้เลย',
      'notion.copyBtn': 'คัดลอกลงคลิปบอร์ด',
      'notion.copied': '✓ คัดลอกแล้ว!',
      'notion.toastOk': 'คัดลอกลงคลิปบอร์ดแล้ว ✓',
      'notion.toastFail': 'คัดลอกไม่สำเร็จ — กรุณากดเลือกทั้งหมดแล้วคัดลอกเอง',
      'csv.exported': 'ส่งออก CSV แล้ว ↓',

      // CSV Import Modal
      'imp.title': 'นำเข้าจากไฟล์ CSV',
      'imp.dropText': 'ลากไฟล์ CSV มาวางที่นี่ <em>หรือคลิกเพื่อเลือกไฟล์</em>',
      'imp.hintHtml': 'รองรับไฟล์ CSV จาก TrackTrade และโบรคเกอร์ทั่วไป<br><b>คอลัมน์ที่จำเป็น:</b> <code>date</code> (หรือ <code>time</code>, <code>open time</code>), <code>symbol</code>, <code>direction</code> (<code>buy</code>/<code>sell</code> หรือ <code>long</code>/<code>short</code>), <code>entry</code>, <code>exit</code><br><b>คอลัมน์เสริม:</b> <code>size</code>/<code>lots</code>, <code>stop_loss</code>/<code>sl</code>, <code>take_profit</code>/<code>tp</code>, <code>multiplier</code>, <code>note</code>/<code>setup</code>, <code>tag</code>',
      'imp.btnCount': 'นำเข้า {n} เทรด ▸',
      'imp.importing': 'กำลังนำเข้า {done}/{total}…',
      'imp.chooseCsv': 'กรุณาเลือกไฟล์ .csv',
      'imp.tooLarge': 'ไฟล์มีขนาดใหญ่เกิน 5 MB',
      'imp.readErr': 'ไม่สามารถอ่านไฟล์ได้',
      'imp.emptyFile': 'ไฟล์ไม่มีข้อมูล',
      'imp.noDataRows': 'ไม่พบแถวข้อมูล — ไฟล์ต้องมีแถวหัวตารางและอย่างน้อย 1 เทรด',
      'imp.tooManyRows': 'จำนวนแถวมากเกินไป ({n} แถว) สูงสุด {max} แถวต่อครั้ง — กรุณาแบ่งไฟล์',
      'imp.missingCols': 'ขาดคอลัมน์ที่จำเป็น: {cols}',
      'imp.badDate': 'วันที่ไม่ถูกต้อง "{val}"',
      'imp.missingSym': 'ไม่มี Symbol',
      'imp.badDir': 'ไม่รู้จัก Direction "{val}"',
      'imp.badEntry': 'ราคา Entry ไม่ถูกต้อง',
      'imp.badExit': 'ราคา Exit ไม่ถูกต้อง',
      'imp.badSize': 'ค่า Size ไม่ถูกต้อง "{val}"',
      'imp.badMult': 'ค่า Multiplier ไม่ถูกต้อง "{val}"',
      'imp.warnAmbiguous': 'มี {n} วันที่ที่สลับวัน/เดือนได้ (เช่น 03/04/2024) ระบบอ่านเป็น {fmt}',
      'imp.warnWrongSL': 'มี {n} เทรดที่ SL อยู่ผิดฝั่งของ Entry — จะนำเข้าโดยไม่คำนวณค่า R',
      'imp.warnDups': 'พบ {n} เทรดที่ซ้ำกับรายการในพอร์ตนี้ — การนำเข้าจะสร้างรายการซ้ำ',
      'imp.validDetected': 'พบ {n} เทรดที่ถูกต้อง',
      'imp.rowsSkipped': ' · ข้าม {n} แถว',
      'imp.noValid': 'ไม่พบรายการเทรดที่ถูกต้อง',
      'imp.lineErr': 'บรรทัด {line}: {reason}',
      'imp.andMoreSkipped': '…และอีก {n} แถวที่ถูกข้าม',
      'imp.andMore': '…และอีก {n} รายการ',
      'imp.okToast': 'นำเข้า {n} เทรดสำเร็จ ✓',
      'imp.partialToast': 'นำเข้าหยุดชะงัก: บันทึกแล้ว {saved} จาก {total} กดนำเข้าอีกครั้งเพื่อเพิ่มอีก {rem} รายการที่เหลือ',
      'imp.failToast': 'นำเข้าไม่สำเร็จ — ไม่มีข้อมูลถูกบันทึก',

      // Ticker & Ticker Settings Modal
      'tkr.upcomingNews': 'ข่าวสำคัญที่กำลังมา ⚡',
      'tkr.title': 'ตั้งค่าแถบข่าว FX (TICKER)',
      'tkr.sourceLbl': 'แหล่งข้อมูล',
      'tkr.sourceVal': 'ช่วงเวลาตลาด + ข่าวเศรษฐกิจสำคัญ',
      'tkr.rateLbl': 'ความถี่อัปเดต',
      'tkr.rateVal': 'ทุก 60 วินาที',
      'tkr.lastLbl': 'อัปเดตล่าสุด',
      'tkr.speedLbl': 'ความเร็วตัววิ่ง (วินาทีต่อรอบ)',
      'tkr.colorLbl': 'สีไฮไลต์',
      'tkr.applied': 'บันทึกการตั้งค่า Ticker แล้ว ✓',

      // Portfolio Modals
      'wlc.title': 'ยินดีต้อนรับสู่ TRACKTRADE',
      'wlc.sub': 'มาตั้งค่าพอร์ตโฟลิโอแรกของคุณกัน',
      'wlc.descHtml': 'ตั้งชื่อพอร์ตและเงินทุน (Balance) เริ่มต้น<br>ระบบจะคำนวณ Return % และยอด Balance ปัจจุบันให้อัตโนมัติ',
      'wlc.btn': 'สร้างพอร์ตของฉัน ▸',
      'prt.newTitle': 'สร้างพอร์ตใหม่',
      'prt.settingsTitle': 'ตั้งค่าพอร์ตโฟลิโอ',
      'prt.name': 'ชื่อพอร์ต (PORTFOLIO NAME)',
      'prt.namePh': 'Crypto Main, Stock US, Futures...',
      'prt.balance': 'เงินทุนเริ่มต้น (STARTING BALANCE $)',
      'prt.deleteBtn': 'ลบพอร์ตนี้',
      'prt.errName': 'กรุณาใส่ชื่อพอร์ตก่อน',
      'prt.errBal': 'กรุณาใส่ Balance ให้ถูกต้อง',
      'prt.updated': 'อัปเดตพอร์ตแล้ว ✓',
      'prt.minOne': 'ต้องมีอย่างน้อย 1 พอร์ต',
      'prt.confirmDel': 'ต้องการลบพอร์ต "{name}" และรายการเทรดทั้งหมดใช่ไหม?',
      'prt.deleted': 'ลบพอร์ตแล้ว',
      'prt.created': 'สร้างพอร์ตแล้ว ✓',

      // DB Errors
      'db.errLoadPorts': 'โหลดข้อมูลพอร์ตไม่สำเร็จ',
      'db.errLoadTrades': 'โหลดข้อมูลเทรดไม่สำเร็จ',
      'db.errCreatePort': 'สร้างพอร์ตไม่สำเร็จ',
      'db.errUpdatePort': 'อัปเดตพอร์ตไม่สำเร็จ',
      'db.errDelPort': 'ลบพอร์ตไม่สำเร็จ',
      'db.errSaveTrade': 'บันทึกออเดอร์ไม่สำเร็จ',
      'db.errUpdateTrade': 'อัปเดตออเดอร์ไม่สำเร็จ',
      'db.errDelTrade': 'ลบออเดอร์ไม่สำเร็จ',
    },

    en: {
      // Loading & Auth
      'common.loading': 'LOADING...',
      'common.cancel': 'CANCEL',
      'common.confirm': 'CONFIRM ▸',
      'common.close': 'Close',
      'common.save': 'SAVE ▸',
      'common.create': 'CREATE ▸',
      'common.apply': 'APPLY ▸',
      'common.none': 'None',
      'common.langToggle': 'Switch language TH / EN',
      'common.langLabel': 'Language: English (EN)',
      'common.langShort': 'EN',

      'auth.tagline': 'TRACK YOUR RETIREMENT',
      'auth.loginTitle': 'LOGIN',
      'auth.registerTitle': 'REGISTER',
      'auth.email': 'EMAIL',
      'auth.password': 'PASSWORD',
      'auth.emailPh': 'trader@email.com',
      'auth.loginBtn': 'LOGIN ▸',
      'auth.registerBtn': 'CREATE ACCOUNT ▸',
      'auth.loadingBtn': 'LOADING...',
      'auth.forgot': 'FORGOT PASSWORD?',
      'auth.noAccount': "Don't have an account?",
      'auth.hasAccount': 'Already have an account?',
      'auth.registerLink': 'Register',
      'auth.loginLink': 'Login',
      'auth.errCaptcha': 'Please complete the CAPTCHA (Turnstile) first.',
      'auth.errRequired': 'Please enter your email and password.',
      'auth.errInvalidEmail': 'Invalid email address.',
      'auth.errEmailFormat': 'Invalid email format.',
      'auth.errPassLen': 'Password must be at least 6 characters.',
      'auth.errLogin': 'Incorrect email or password.',
      'auth.errForgotEmail': 'Enter your email before clicking Forgot Password.',
      'auth.okSignup': 'Registration successful! ✓ Check your email to confirm.',
      'auth.okReset': 'Password reset link sent to your email ✓',
      'auth.waitCooldown': 'Please wait {s}s before trying again.',

      // 3D Intro
      'intro.loading': 'Loading the intro',
      'intro.skip': 'Skip intro',
      'intro.skipAria': 'Skip intro and open the dashboard',
      'intro.scroll': 'Scroll to enter',
      'intro.enter': 'Enter dashboard',
      'intro.heroTitle': 'MASTER THE EDGE.',
      'intro.heroSub': 'Where every trade becomes data, and every decision becomes an edge.',
      'intro.ch1Name': 'Record',
      'intro.ch1Tag': '<b>01</b>Record',
      'intro.ch1Title': 'EVERY TRADE, ON THE RECORD.',
      'intro.ch1Desc': "Log entry, exit, size and your reasoning in seconds. The journal remembers what memory won't.",
      'intro.ch2Name': 'Risk',
      'intro.ch2Tag': '<b>02</b>Risk',
      'intro.ch2Title': 'NAVIGATE THE VOLATILITY.',
      'intro.ch2Desc': 'Define your risk before you enter. Real-time calculated sizing. Never let market noise decide.',
      'intro.ch3Name': 'Returns',
      'intro.ch3Tag': '<b>03</b>Returns',
      'intro.ch3Title': 'THINK IN R. NOT MONEY.',
      'intro.ch3Desc': 'Stop chasing numbers. Start measuring execution. Understand your edge through Risk-to-Reward.',
      'intro.ch4Name': 'Audit',
      'intro.ch4Tag': '<b>04</b>Audit',
      'intro.ch4Title': 'DISSECT EVERY LAYER.',
      'intro.ch4Desc': 'Expose hidden patterns. Analyze Win Rate, Profit Factor, and true statistical expectancy.',
      'intro.ch5Name': 'Accounts',
      'intro.ch5Tag': '<b>05</b>Accounts',
      'intro.ch5Title': 'ONE SYSTEM. EVERY ACCOUNT.',
      'intro.ch5Desc': 'Personal, prop firm, and crypto portfolios synced with seamless multi-account intelligence.',
      'intro.ch6Name': 'Overview',
      'intro.ch6Tag': '<b>06</b>Overview',
      'intro.ch6Title': 'THE WHOLE PICTURE, ONE SCREEN.',
      'intro.ch6Desc': 'Equity curve, heatmap calendar, streaks and symbol ranking, updated as you log.',
      'intro.liveChapter': 'Chapter {i} of {n}: {name}',
      'intro.jumpChapter': 'Jump to chapter {i}: {name}',

      // Nav Rail & Mobile Tabbar & More Sheet
      'nav.dashboard': 'Dashboard',
      'nav.dashboardTitle': 'Dashboard Overview',
      'nav.journal': 'Journal',
      'nav.journalTitle': 'Full Trade Journal',
      'nav.heatmap': 'Heatmap',
      'nav.heatmapTitle': 'Trading Heatmap',
      'nav.analytics': 'Analytics',
      'nav.analyticsTitle': 'Analytics & Breakdown',
      'nav.settings': 'Settings',
      'nav.settingsTitle': 'Portfolio Settings',
      'nav.intro': '3D Intro',
      'nav.introTitle': 'Replay 3D Intro',
      'nav.themeTitle': 'Toggle dark / light',
      'nav.logout': 'Logout',
      'nav.more': 'More',
      'nav.newTradeAria': 'New trade',
      'nav.portfolioSettings': 'Portfolio settings',
      'nav.tickerSettings': 'Ticker settings',
      'nav.switchTheme': 'Switch dark / light',
      'nav.replayIntro': 'Replay 3D intro',

      // Header
      'header.searchPh': 'Search trades, symbols, setups...',
      'header.searchAria': 'Search trades',
      'header.tickerTitle': 'Configure Live FX Ticker',

      // Stats Cards & Hero Equity
      'stats.totalPnl': 'TOTAL P&L',
      'stats.winRate': 'WIN RATE',
      'stats.profitFactor': 'PROFIT FACTOR',
      'stats.bestTrade': 'BEST TRADE',
      'stats.onInitial': 'on initial balance',
      'stats.vs50': 'vs 50% · {w}W / {l}L',
      'stats.avgWinLoss': 'avg win / avg loss',
      'stats.worstTrade': 'worst trade',

      'equity.balanceLabel': 'TOTAL PORTFOLIO BALANCE',
      'equity.allTime': 'ALL TIME',
      'equity.month': 'THIS MONTH',
      'equity.week': 'THIS WEEK',
      'equity.last30d': 'LAST 30D',
      'equity.extendTitle': 'Extend Fullscreen',
      'equity.statTotalPnl': 'TOTAL P&L',
      'equity.statWinRate': 'WIN RATE',
      'equity.statMaxDD': 'MAX DRAWDOWN',
      'equity.statTrades': 'TRADES',
      'equity.growthTrend': 'Growth Trend',
      'equity.benchmarkBase': 'Benchmark Base',
      'equity.tooltipEquity': 'Equity',

      // Heatmap
      'hmap.tag': 'PERFORMANCE MATRIX',
      'hmap.title': 'Trading P&L Heatmap',
      'hmap.prevMonth': 'Previous month',
      'hmap.nextMonth': 'Next month',
      'hmap.lossDay': 'Loss Day',
      'hmap.noTrade': 'No Trade',
      'hmap.profitDay': 'Profit Day',
      'hmap.days': ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      'hmap.tradesWord': 'trades',
      'hmap.cleared': 'Cleared date filter',
      'hmap.filtered': 'Filtered for {date}',
      'hmap.showingAll': 'Showing all recent trades',

      // Analytics
      'ana.tag': 'EXECUTION INTELLIGENCE',
      'ana.title': 'Win / Loss & Symbols',
      'ana.symPerf': 'SYMBOL PERFORMANCE',
      'ana.win': 'WIN',
      'ana.loss': 'LOSS',
      'ana.grossProfit': 'GROSS PROFIT',
      'ana.grossLoss': 'GROSS LOSS',
      'ana.noData': 'No data yet',
      'ana.curWinStreak': 'CURRENT WIN STREAK',
      'ana.curLossStreak': 'CURRENT LOSS STREAK',
      'ana.curStreak': 'CURRENT STREAK',
      'ana.bestStreak': 'BEST: {n} {type}',
      'ana.winsPlural': 'WINS',
      'ana.lossesPlural': 'LOSSES',

      // Accounts / Portfolios
      'acc.tag': 'MY PORTFOLIOS',
      'acc.title': 'Trading Accounts',
      'acc.newBtn': '+ New',
      'acc.newBtnTitle': 'Add new portfolio',
      'acc.activeTag': 'ACTIVE ACCOUNT',
      'acc.balanceLabel': 'ACCOUNT BALANCE',
      'acc.newTrade': '+ NEW TRADE',
      'acc.importCsvTitle': 'Import CSV',
      'acc.exportCsvTitle': 'Export CSV',
      'acc.settingsTitle': 'Settings',
      'acc.extTitle': 'All Connected Trading Accounts',
      'acc.extDesc': 'Manage balances, review win rates, and toggle between prop firm, personal, and demo accounts.',
      'acc.extCreate': '+ Create New Portfolio',
      'acc.curActive': '● CURRENT ACTIVE',
      'acc.subAccount': 'SUB-ACCOUNT',
      'acc.netPnl': 'NET P&L',
      'acc.returnLbl': 'RETURN',
      'acc.winRateLbl': 'WIN RATE',
      'acc.tradesCount': '({n} Trades)',
      'acc.switchBtn': 'Switch Account',
      'acc.activeBadge': '✓ ACTIVE',

      // Recent Trades & Journal
      'trd.tag': 'LIVE EXECUTION',
      'trd.title': 'Recent Trades',
      'trd.viewAll': 'View All →',
      'trd.all': 'ALL',
      'trd.long': 'LONG',
      'trd.short': 'SHORT',
      'trd.wins': 'WINS',
      'trd.losses': 'LOSSES',
      'trd.emptyCompact': 'NO TRADES LOGGED YET',
      'trd.extTitle': 'Live Execution Ledger & Deep Inspection',
      'trd.extDesc': 'Full multi-column trade audit trail with one-click order detail inspection.',
      'trd.backOverview': '← Back to Overview',
      'trd.fullJournal': 'FULL TRADE JOURNAL',
      'trd.newTradeBtn': '+ NEW TRADE',
      'trd.emptyTable': 'NO TRADES FOUND',
      'trd.emptyCta': '+ LOG FIRST TRADE',
      'trd.emptyExt': 'No trades found matching current filter criteria.',
      'trd.emptyFeed': 'No trades found {suffix}',
      'trd.emptyFeedDate': 'on {date}',
      'trd.emptyFeedFilter': 'with current filters',
      'trd.resetBtn': '✕ Reset',
      'trd.resetTitle': 'Show all trades',
      'trd.clickDetails': 'Click to view details of {sym}',
      'trd.orderDetailsTitle': 'Order details',
      'trd.inspectTitle': 'Inspect order details',
      'trd.inspectBtn': '••• Inspect',
      'trd.units': 'units',
      'trd.noTag': 'No tag',
      'trd.noNote': 'No notes entered for this trade execution.',
      'trd.balAfterTitle': 'Balance after trade',
      'trd.editTitle': 'Edit',
      'trd.deleteTitle': 'Delete',
      'trd.prevPage': '◀ PREV',
      'trd.nextPage': 'NEXT ▶',
      'trd.pageOf': 'PAGE {cur} OF {total}',
      'trd.extModeToast': 'Extended view mode',

      // Table Columns
      'col.date': 'DATE',
      'col.sym': 'SYM',
      'col.dir': 'DIR',
      'col.entry': 'ENTRY',
      'col.exit': 'EXIT',
      'col.size': 'SIZE',
      'col.pnl': 'P&L',
      'col.pnlUsd': 'P&L (USD)',
      'col.pct': '%',
      'col.returnPct': 'RETURN %',
      'col.r': 'R',
      'col.setup': 'SETUP',
      'col.tag': 'TAG',
      'col.action': 'ACTION',

      // Add / Edit Trade Modal
      'mdl.newTrade': 'NEW TRADE ENTRY',
      'mdl.editTrade': 'EDIT TRADE',
      'mdl.saveTrade': 'SAVE TRADE ▸',
      'mdl.symbol': 'SYMBOL',
      'mdl.symOther': 'OTHER (Custom)...',
      'mdl.symCustomPh': 'e.g. BTCUSD',
      'mdl.contractSize': 'Contract size: {label}',
      'mdl.date': 'DATE',
      'mdl.dir': 'DIRECTION',
      'mdl.entry': 'ENTRY PRICE',
      'mdl.exit': 'EXIT PRICE',
      'mdl.sl': 'STOP LOSS',
      'mdl.tp': 'TAKE PROFIT',
      'mdl.optional': 'Optional',
      'mdl.size': 'POSITION SIZE',
      'mdl.portBalance': 'PORTFOLIO BALANCE',
      'mdl.setupNotes': 'SETUP / NOTES',
      'mdl.setupPh': 'Breakout, Support bounce, Trend follow...',
      'mdl.tag': 'TAG',
      'mdl.estPnl': 'ESTIMATED P&L',
      'mdl.dist': 'Distance',
      'mdl.points': 'Points',
      'mdl.accGrowth': 'Account',
      'mdl.riskPort': 'of Port',
      'mdl.slRule': 'SL must be {side} entry for a {dir}',
      'mdl.slRuleSave': 'Stop loss must be {side} entry for a {dir}',
      'mdl.below': 'below',
      'mdl.above': 'above',
      'mdl.noPortfolio': 'No portfolio — create one first',
      'mdl.fillRequired': 'Fill in all required fields',
      'mdl.updated': 'Trade updated ✓',
      'mdl.saved': 'Trade saved ✓',
      'mdl.confirmDelTrade': 'Delete this trade?',
      'mdl.deleted': 'Trade deleted',

      // Order Details Modal
      'dtl.badge': 'ORDER INSPECTOR',
      'dtl.netPnl': 'NET REALIZED P&L',
      'dtl.returnR': '{pct} Return • {r}',
      'dtl.date': 'TRADE DATE',
      'dtl.size': 'POSITION SIZE',
      'dtl.entry': 'ENTRY PRICE',
      'dtl.exit': 'EXIT PRICE',
      'dtl.sl': 'STOP LOSS',
      'dtl.tp': 'TAKE PROFIT',
      'dtl.r': 'ACTUAL R-MULTIPLE',
      'dtl.tag': 'STRATEGY / TAG',
      'dtl.notes': 'SETUP / EXECUTION NOTES',
      'dtl.delBtn': '🗑 Delete Trade',
      'dtl.editBtn': '✏ Edit Trade',

      // Notion Export Modal
      'notion.title': 'EXPORT FOR NOTION',
      'notion.desc': 'Copy → Open Notion → Create Table → Ctrl+V to paste',
      'notion.copyBtn': 'COPY TO CLIPBOARD',
      'notion.copied': '✓ COPIED!',
      'notion.toastOk': 'Copied to clipboard ✓',
      'notion.toastFail': 'Copy failed — select all and copy manually',
      'csv.exported': 'CSV exported ↓',

      // CSV Import Modal
      'imp.title': 'IMPORT FROM CSV',
      'imp.dropText': 'DROP CSV FILE HERE <em>or click to browse</em>',
      'imp.hintHtml': 'Works with TrackTrade CSV exports and common broker/platform headers.<br><b>Required:</b> <code>date</code> (or <code>time</code>, <code>open time</code>), <code>symbol</code>, <code>direction</code> (<code>buy</code>/<code>sell</code> or <code>long</code>/<code>short</code>), <code>entry</code>, <code>exit</code><br><b>Optional:</b> <code>size</code>/<code>lots</code>, <code>stop_loss</code>/<code>sl</code>, <code>take_profit</code>/<code>tp</code>, <code>multiplier</code>, <code>note</code>/<code>setup</code>, <code>tag</code>',
      'imp.btnCount': 'IMPORT {n} TRADES ▸',
      'imp.importing': 'IMPORTING {done}/{total}…',
      'imp.chooseCsv': 'Please choose a .csv file.',
      'imp.tooLarge': 'File is larger than 5 MB.',
      'imp.readErr': 'Could not read the file.',
      'imp.emptyFile': 'The file is empty.',
      'imp.noDataRows': 'No data rows found — the file needs a header row and at least one trade.',
      'imp.tooManyRows': 'Too many rows ({n}). Maximum is {max} per import — split the file.',
      'imp.missingCols': 'Missing required columns: {cols}',
      'imp.badDate': 'invalid date "{val}"',
      'imp.missingSym': 'missing symbol',
      'imp.badDir': 'unrecognized direction "{val}"',
      'imp.badEntry': 'invalid entry price',
      'imp.badExit': 'invalid exit price',
      'imp.badSize': 'invalid size "{val}"',
      'imp.badMult': 'invalid multiplier "{val}"',
      'imp.warnAmbiguous': '{n} date(s) were ambiguous (e.g. 03/04/2024) and read as {fmt}.',
      'imp.warnWrongSL': '{n} trade(s) have a stop loss on the wrong side of entry — imported without an R value.',
      'imp.warnDups': '{n} trade(s) look identical to trades already in this portfolio — importing will create duplicates.',
      'imp.validDetected': '{n} valid trade(s) detected',
      'imp.rowsSkipped': ' · {n} row(s) skipped',
      'imp.noValid': 'No valid trades found',
      'imp.lineErr': 'line {line}: {reason}',
      'imp.andMoreSkipped': '…and {n} more skipped',
      'imp.andMore': '…and {n} more',
      'imp.okToast': 'Imported {n} trade(s) successfully ✓',
      'imp.partialToast': 'Import stopped: {saved} of {total} saved. Press import again to add the remaining {rem}.',
      'imp.failToast': 'Import failed — nothing was saved',

      // Ticker & Ticker Settings Modal
      'tkr.upcomingNews': 'UPCOMING NEWS ⚡',
      'tkr.title': 'TICKER SETTINGS',
      'tkr.sourceLbl': 'DATA SOURCE',
      'tkr.sourceVal': 'Market Sessions + Upcoming News',
      'tkr.rateLbl': 'REFRESH RATE',
      'tkr.rateVal': 'Every 60 seconds',
      'tkr.lastLbl': 'LAST UPDATE',
      'tkr.speedLbl': 'SCROLL SPEED (seconds per loop)',
      'tkr.colorLbl': 'HIGHLIGHT COLOR',
      'tkr.applied': 'Ticker settings applied ✓',

      // Portfolio Modals
      'wlc.title': 'WELCOME TO TRACKTRADE',
      'wlc.sub': "LET'S SET UP YOUR FIRST PORTFOLIO",
      'wlc.descHtml': 'Name your portfolio and set your starting balance.<br>Return % and current balance are calculated automatically.',
      'wlc.btn': 'CREATE MY PORTFOLIO ▸',
      'prt.newTitle': 'NEW PORTFOLIO',
      'prt.settingsTitle': 'PORTFOLIO SETTINGS',
      'prt.name': 'PORTFOLIO NAME',
      'prt.namePh': 'Crypto Main, Stock US, Futures...',
      'prt.balance': 'STARTING BALANCE ($)',
      'prt.deleteBtn': 'DELETE THIS PORTFOLIO',
      'prt.errName': 'Please enter a portfolio name',
      'prt.errBal': 'Please enter a valid balance',
      'prt.updated': 'Portfolio updated ✓',
      'prt.minOne': 'At least 1 portfolio is required',
      'prt.confirmDel': 'Delete portfolio "{name}" and all its trades?',
      'prt.deleted': 'Portfolio deleted',
      'prt.created': 'Portfolio created ✓',

      // DB Errors
      'db.errLoadPorts': 'Error loading portfolios',
      'db.errLoadTrades': 'Error loading trades',
      'db.errCreatePort': 'Error creating portfolio',
      'db.errUpdatePort': 'Error updating portfolio',
      'db.errDelPort': 'Error deleting portfolio',
      'db.errSaveTrade': 'Error saving trade',
      'db.errUpdateTrade': 'Error updating trade',
      'db.errDelTrade': 'Error deleting trade',
    }
  };

  let currentLang = 'th';
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'th' || saved === 'en') currentLang = saved;
  } catch (_) {}

  function getLang() { return currentLang; }

  function t(key, vars) {
    const dict = DICT[currentLang] || DICT.th;
    let val = dict[key];
    if (val === undefined) val = DICT.en[key];
    if (val === undefined) return key;
    if (Array.isArray(val)) return val;
    if (vars && typeof val === 'string') {
      return val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
    }
    return val;
  }

  function applyI18n() {
    document.documentElement.lang = currentLang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (k) el.textContent = t(k);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const k = el.getAttribute('data-i18n-html');
      if (k) el.innerHTML = t(k);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const k = el.getAttribute('data-i18n-ph');
      if (k) el.setAttribute('placeholder', t(k));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const k = el.getAttribute('data-i18n-title');
      if (k) el.setAttribute('title', t(k));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const k = el.getAttribute('data-i18n-aria');
      if (k) el.setAttribute('aria-label', t(k));
    });

    // Update language toggle buttons
    const shortLbl = currentLang.toUpperCase();
    document.querySelectorAll('.lang-short-label').forEach(el => { el.textContent = shortLbl; });

    // Sync Auth toggle text according to current mode
    const authTitle = document.getElementById('authTitle');
    if (authTitle) {
      const isReg = authTitle.dataset.mode === 'register';
      authTitle.textContent = t(isReg ? 'auth.registerTitle' : 'auth.loginTitle');
      const tm = document.getElementById('authToggleMsg');
      const tl = document.getElementById('authToggleLink');
      if (tm) tm.textContent = t(isReg ? 'auth.hasAccount' : 'auth.noAccount');
      if (tl) tl.textContent = t(isReg ? 'auth.loginLink' : 'auth.registerLink');
    }

    // Re-render dynamic views if loaded
    if (typeof window.ScrollyIntro?.refreshLang === 'function') window.ScrollyIntro.refreshLang();
    if (typeof buildForexTicker === 'function') buildForexTicker();
    if (typeof portfolios !== 'undefined' && portfolios.length && typeof render === 'function') {
      renderPortfolioTabs?.();
      render();
      if (document.getElementById('cardAccounts')?.classList.contains('is-expanded')) renderExtendedPortfolios?.();
      if (document.getElementById('cardTrades')?.classList.contains('is-expanded')) renderExtendedTradesTable?.();
    }
    if (document.getElementById('modalOverlay')?.classList.contains('open')) {
      document.querySelector('#modalOverlay .modal-title').textContent = t(editingId !== null ? 'mdl.editTrade' : 'mdl.newTrade');
      applySymbolPreset?.();
    }
    if (document.getElementById('importModalOverlay')?.classList.contains('open')) {
      renderImportPreview?.();
    }
  }

  function setLang(lang) {
    if (lang !== 'th' && lang !== 'en') return;
    currentLang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}
    applyI18n();
  }

  function toggleLang() {
    setLang(currentLang === 'th' ? 'en' : 'th');
  }

  window.t = t;
  window.getLang = getLang;
  window.setLang = setLang;
  window.toggleLang = toggleLang;
  window.applyI18n = applyI18n;
})();
