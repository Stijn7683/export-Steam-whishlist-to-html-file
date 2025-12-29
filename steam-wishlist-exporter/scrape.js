(async function () {
  function setStatus(text) {
    chrome.runtime.sendMessage({
      type: "status",
      text
    });
  }

  try {
    // ---------- 1. Find Wishlist Container ----------
    const container =
      document.querySelector("[data-rfd-droppable-id='droppable']") ||
      document.querySelector(".wishlist_page");

    if (!container) {
      alert("Wishlist page not found.");
      return;
    }
    
    // ---------- 2. hover over images ----------
    setStatus('Loading images...');
    const elements = container.querySelectorAll('.TjfbNdRyip4-');
    for (let i = 0; i < elements.length; i++) {  
      const el = elements[i];
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await new Promise(r => setTimeout(r, 170));
    }

    // work only on a clone to avoid any Steam event triggers
    const clone = container.cloneNode(true);

    // ---------- 3. gather discount endtimes ----------
    // Collect all discounted items with their store URLs
    const discountedApps = Array.from(clone.querySelectorAll("a.oVvbc-NOBF8-")).map(a => {
      const item = a.closest("[data-index]");
      if (!item) return null;

      const priceBlock = item.querySelector(".MKj0TKJbfZY-");
      const discountSpan = priceBlock?.querySelector(".XXn-kJ7FSrw-");

      if (discountSpan) {
        return {
          item,
          priceBlock,
          url: a.href
        };
      }

      return null;
    }).filter(Boolean);    

  
    chrome.runtime.sendMessage({ type: "log", message: discountedApps.length});
    if (discountedApps.length != 0) {
      if (discountedApps.length == 1) {
        setStatus('Collecting discount ending time...');
      } else { //multiple
        setStatus('Collecting discount ending times...');
      }
    }

    for (const app of discountedApps) {
      const EndTime = await fetchDiscountEnd(app.url);
      if (!EndTime) continue;

      const endDate = parseSteamExpirationToRealDate(EndTime);
      chrome.runtime.sendMessage({ type: "log", message: EndTime});
      chrome.runtime.sendMessage({ type: "log", message: endDate});

      chrome.runtime.sendMessage({type: "log", message: `Parsed end date for ${app.url}: ${EndTime}`});

      // 1. Set attribute on the ORIGINAL element (app.item is the real one in the DOM)
      app.item.setAttribute("data-discount-end", EndTime);

      // 2. Find the SAME app block inside your clone and set it there too
      //    (adjust the selector to whatever uniquely identifies the block in the clone)
      const clonedBlock = clone.querySelector(`[href="${app.url}"]`)?.closest('.discount_block, .search_result_row, .item_def') ||
                          clone.querySelector(`[data-ds-appid="${app.item.dataset.dsAppid}"]`);

      if (clonedBlock) {
        clonedBlock.setAttribute("data-discount-end", EndTime);
      }

      const now = new Date();
      chrome.runtime.sendMessage({ type: "log", message: `enddate: ${now}` });
      chrome.runtime.sendMessage({ type: "log", message: `enddate: ${EndTime}` });
    }

    // Now this will finally work and show a number > 0
    const count = clone.querySelectorAll("[data-discount-end]").length;
    chrome.runtime.sendMessage({ 
      type: "log", 
      message: `Found ${count} elements with data-discount-end in clone` 
    });

    setStatus('Removeing unnececary elements...');
    // ---------- 3. Remove drag handles ----------
    clone.querySelectorAll("[data-rfd-drag-handle-draggable-id]").forEach(el => el.remove());
    clone.querySelectorAll(".wgHGKOWFf8c-").forEach(el => el.remove());

    // ---------- 4. Remove date-added + remove-button rows ----------
    clone.querySelectorAll(".p2qp0XfBE8M-").forEach(el => el.remove());

    // remove any containers that contain a remove-button
    clone.querySelectorAll("button").forEach(btn => {
      if (btn.textContent.trim().toLowerCase().includes("verwijderen")) {
        const parent = btn.closest("div");
        if (parent) parent.remove();
      }
    });

    // ---------- 5. remove 'Een notitie toevoegen' ----------
    clone.querySelectorAll('div.svelte-y27jhv.is-empty').forEach(el => {
      el.remove();
    });


    // ---------- 6. Make index inputs readonly + center ----------
    clone.querySelectorAll(".s3BAyjuoPYA-").forEach(outer => {
      outer.style.justifyContent = "center"; // horizontal center
    });

    clone.querySelectorAll(".s3BAyjuoPYA- input").forEach(input => {
      input.setAttribute("readonly", "readonly");
      input.style.pointerEvents = "none";
      input.style.textAlign = "center";
      input.style.margin = "0 auto";
    });

    // ---------- 7. Replace old buttons with "View in Steam" ----------
    clone.querySelectorAll('div.LSY1zV2DJSM-').forEach(row => {
        const titleLink = row.querySelector('a[href^="https://store.steampowered.com/app/"]');
        if (!titleLink) return;
        const gameUrl = titleLink.href.split('?')[0];

        const oldEl = row.querySelector('button._5b8C30zCFXs-, a._5b8C30zCFXs-[href*="cart"]');
        if (!oldEl || oldEl.dataset.done) return;

        const a = document.createElement('a');
        a.href = gameUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = oldEl.className;
        a.innerHTML = '<span>in Steam bekijken</span>';
        a.role = 'button';
        a.tabIndex = 0;
        a.dataset.done = '1';
        a.style = ' align-self: center !important; justify-self: center !important;';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width: 100%; display: flex; justify-content: center; align-items: center;';
        wrapper.appendChild(a);
        oldEl.replaceWith(wrapper);
    });


    // ---------- 8. optionally convert images to base64 ----------
    /*
    async function urlToDataURL(url) {
      try {
        if (!url || url.startsWith("data:")) return url;
        const absolute = new URL(url, document.baseURI).href;
        const res = await fetch(absolute);
        const blob = await res.blob();

        return await new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn("Could not convert image:", url, e);
        return url; // fallback
      }
    }

    for (let img of clone.querySelectorAll("img")) {
      const src = img.src;
      img.src = await urlToDataURL(src);
      img.removeAttribute("srcset");
    }
    */

    setStatus('Almost done...')
    // ---------- 9. Collect all CSS from the page ----------
    let cssText = '@media screen {html {-webkit-transition : -webkit-filter 300ms linear;}}@charset "UTF-8";.SVGIcon_Button{fill:#fff;overflow:visible;width:100%;height:100%;max-width:320px;max-height:320px}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-Regular-M3U7OXBG.ttf") format("truetype");font-weight:400;font-style:normal}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-Light-D4BTRMDA.ttf") format("truetype");font-weight:300;font-style:normal}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-Thin-AFQIVEVS.ttf") format("truetype");font-weight:200;font-style:normal}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-Medium-ZOTNXHYE.ttf") format("truetype");font-weight:500;font-style:normal}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-Bold-D2ZE4FMC.ttf") format("truetype");font-weight:700;font-style:normal}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-RegularItalic-PVFRMCJ4.ttf") format("truetype");font-weight:400;font-style:italic}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-LightItalic-OJI3C7XE.ttf") format("truetype");font-weight:300;font-style:italic}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-BoldItalic-PVRNO4QG.ttf") format("truetype");font-weight:700;font-style:italic}@font-face{font-family:Motiva Sans;src:url("./MotivaSans-Black-LAJLWIHN.ttf") format("truetype");font-weight:900;font-style:normal}@keyframes FLDEa7rRhyY-{0%{background-color:#ffffff14}to{background-color:#fff0}}@keyframes nWDadfKww6s-{0%{outline:12px solid}to{outline:2px solid}}@keyframes N5-VUB--qfQ-{0%{outline-color:#fff0}to{outline-color:#fff9}}@keyframes ppcisOXf8KU-{50%{opacity:.4}}@keyframes xz-cm3IJfg8-{0%{opacity:1}to{opacity:.1}}@keyframes _7sHyYh1zPwM-{0%{opacity:1}25%{opacity:1}to{opacity:.25}}@keyframes kTXY8cD5Pxk-{0%{opacity:.25}25%{opacity:.25}50%{opacity:1}75%{opacity:.25}to{opacity:.25}}@keyframes _4UQ4ItAeIwQ-{0%{opacity:.25}50%{opacity:.25}75%{opacity:1}to{opacity:.25}}@keyframes wrVO9nyctWY-{0%{opacity:1}25%{opacity:.25}75%{opacity:.25}to{opacity:1}}@keyframes PlD7nYrtkrw-{0%{opacity:1}25%{opacity:.25}75%{opacity:.25}to{opacity:1}}@keyframes VqnTYPtpoQE-{0%{transform:translate(0)}13%{transform:translate(-15px)}25%{transform:translate(-30px)}38%{transform:translate(-15px,-5px)}50%{transform:translateY(-10px)}63%{transform:translate(20px,-25px)}75%{transform:translate(25px,-15px)}88%{transform:translate(30px,-5px)}to{transform:translate(0)}}@keyframes _0zG80HdGWLU-{0%{offset-distance:0%}50%{offset-distance:100%}to{offset-distance:0%}}@keyframes R5C1MKm20Zc-{0%{transform:translate(-40px)}13%{transform:translate(-55px)}25%{transform:translate(-70px)}38%{transform:translate(-55px,-5px)}50%{transform:translate(-40px,-10px)}63%{transform:translate(-10px,-25px)}75%{transform:translate(-15px,-15px)}88%{transform:translate(-10px,-5px)}to{transform:translate(-40px)}}@keyframes dClHmtjb3kM-{0%{transform:translateY(0);fill:transparent;stroke:#fff}90%{transform:translateY(0);fill:transparent;stroke:#fff}94%{transform:translateY(5px);fill:#1a9fff;stroke:#1a9fff;stroke-width:16px}96%{transform:translateY(0);fill:transparent}98%{transform:translateY(5px);fill:#1a9fff;stroke:#1a9fff;stroke-width:16px}to{transform:translateY(0);fill:transparent;stroke:#fff;stroke-width:8px}}@keyframes w3vr4ZbkJj4-{0%{opacity:0;r:25}90%{opacity:0;r:25}94%{opacity:1;r:100}96%{opacity:0;r:25}98%{opacity:1;r:100}to{opacity:0;r:25}}@keyframes RjtsAQW-nCg-{0%{transform:rotate(0)}3%{transform:rotate(16deg)}6%{transform:rotate(-16deg)}9%{transform:rotate(15deg)}12%{transform:rotate(-15deg)}15%{transform:rotate(14deg)}18%{transform:rotate(-14deg)}21%{transform:rotate(8deg)}24%{transform:rotate(-8deg)}27%{transform:rotate(3deg)}30%{transform:rotate(-3deg)}33%{transform:rotate(0)}to{transform:rotate(0)}}@keyframes -THnGhhzqZw-{0%{transform:translate(0)}3%{transform:translate(6px)}5%{transform:translate(-6px)}8%{transform:translate(5px)}11%{transform:translate(-5px)}14%{transform:translate(4px)}17%{transform:translate(-4px)}20%{transform:translate(4px)}23%{transform:translate(-2px)}26%{transform:translate(2px)}29%{transform:translate(1px)}32%{transform:translate(0)}to{transform:translate(0)}}@keyframes _3oUPRczfisE-{0%{background-position:0 100%}to{background-position:100% 0}}@keyframes reRnJkje-ZQ-{0%{background:#3d4450}to{background:#23262e}}@keyframes GnQCsUIcepE-{0%{background:#3d4450;color:#8b929a}to{background:#23262e;color:#fff}}@keyframes SWu7NonFdkU-{0%{background:#ffffff40;color:#8b929a}to{background:#ffffff26;color:#fff}}@keyframes QJusGCvT-4Y-{0%{background:#8b929a;color:#fff}to{background:#67707b;color:#fff}}@keyframes P1r8QNNbNSM-{0%{background:#ffffff4d;color:#fff}to{background:#ffffff1a;color:#fff}}@keyframes GqREDPxDbxM-{0%{background:#ffffff80;color:#fff}to{background:#fff3;color:#fff}}@keyframes Ad6X517YYro-{0%{border-color:#67707b}to{border-color:#3d4450}}@keyframes VEEAdWH5tZs-{0%{background:#c9ffc9;color:#8b929a}to{background:#59bf40;color:#fff}}@keyframes ZW4-YnjuMks-{0%{background-position:0% 0%;opacity:1}to{background-position:-180% 0%;opacity:.8}}@keyframes XJOK6Bj-tjQ-{0%{background-position:0% 0%}to{background-position:50% 0%}}@keyframes Rkr-g6was2M-{0%{background-color:#3d4450}to{background-color:unset}}@keyframes TiEL0eLbDU0-{0%{background-position:-600px 0}to{background-position:0px 0}}@keyframes NVMM7FMSHIE-{0%{background-position:0 100%}to{background-position:100% 0}}@keyframes JIP7y1MHc3k-{0%{background:#3d4450}to{background:#23262e}}@keyframes uYOeOR-OMTg-{0%{background:#3d4450;color:#8b929a}to{background:#23262e;color:#fff}}@keyframes _4jpS--H87-Q-{0%{background:#ffffff40;color:#8b929a}to{background:#ffffff26;color:#fff}}@keyframes m6dmyy8Nn7E-{0%{background:#8b929a;color:#fff}to{background:#67707b;color:#fff}}@keyframes bvaNTW8B-Pw-{0%{background:#ffffff4d;color:#fff}to{background:#ffffff1a;color:#fff}}@keyframes BqDoWhmippE-{0%{background:#ffffff80;color:#fff}to{background:#fff3;color:#fff}}@keyframes BHsNfI3lXGA-{0%{border-color:#67707b}to{border-color:#3d4450}}@keyframes julHcVyLcOQ-{0%{background:#c9ffc9;color:#8b929a}to{background:#59bf40;color:#fff}}@keyframes f-AiKKxiDS8-{0%{background-position:0% 0%;opacity:1}to{background-position:-180% 0%;opacity:.8}}@keyframes hhHZZcF89bs-{0%{background-position:0% 0%}to{background-position:50% 0%}}@keyframes JEsB-6eQkmU-{0%{background-color:#3d4450}to{background-color:unset}}@keyframes XxdizQ4j-Wk-{0%{background-position:-600px 0}to{background-position:0px 0}}@keyframes UQdtbjn5CaI-{0%{background-position:0 100%}to{background-position:100% 0}}@keyframes PD6CSeqdrCA-{0%{background:#3d4450}to{background:#23262e}}@keyframes qNZkq-xq0-A-{0%{background:#3d4450;color:#8b929a}to{background:#23262e;color:#fff}}@keyframes DYRmsgpoZ44-{0%{background:#ffffff40;color:#8b929a}to{background:#ffffff26;color:#fff}}@keyframes HNxenyHveoc-{0%{background:#8b929a;color:#fff}to{background:#67707b;color:#fff}}@keyframes _-4uE7EAkdQU-{0%{background:#ffffff4d;color:#fff}to{background:#ffffff1a;color:#fff}}@keyframes gA7gQJvenY8-{0%{background:#ffffff80;color:#fff}to{background:#fff3;color:#fff}}@keyframes _3cpSBJr7Nvk-{0%{border-color:#67707b}to{border-color:#3d4450}}@keyframes w-cr6YC3ZDY-{0%{background:#c9ffc9;color:#8b929a}to{background:#59bf40;color:#fff}}@keyframes BZcQYSdnpH0-{0%{background-position:0% 0%;opacity:1}to{background-position:-180% 0%;opacity:.8}}@keyframes _44i2N0J3GZw-{0%{background-position:0% 0%}to{background-position:50% 0%}}@keyframes IXdOFYdo3nk-{0%{background-color:#3d4450}to{background-color:unset}}@keyframes y1ElEVPqy-o-{0%{background-position:-600px 0}to{background-position:0px 0}}@keyframes tsH9ULEMSz8-{0%{transform:scaleX(0)}to{transform:scaleX(1)}}body{--store-menu-content-width: max( 1100px, var( --store-page-width, 0px ) )}@keyframes _0LVhrp9VgCU-{0%{height:46px}to{height:0}}.MKj0TKJbfZY-{display:flex;background:#344654}.MKj0TKJbfZY-.eUuYcDLWhSQ-{background:transparent}.MKj0TKJbfZY-.dCDWhe2g-MY-{min-height:36px;--original-price-font-size: 11px;--original-price-color: #738895;--final-price-font-size: 15px;--final-price-color: #FFFFFF}.bWcsWKN3D84-{background:#4c6b2280;display:flex;flex-direction:column;justify-content:center;color:#beee11}.bWcsWKN3D84- .XXn-kJ7FSrw-{font-weight:500}.dCDWhe2g-MY- .bWcsWKN3D84- .XXn-kJ7FSrw-{font-size:26px;padding:0 5px;line-height:34px}.ME2eMO7C1Tk-{display:flex;flex-direction:column;justify-content:center;align-items:flex-end}.dCDWhe2g-MY- .ME2eMO7C1Tk-{padding:0 8px}.ME2eMO7C1Tk-.t-DeM6TllH4-{justify-content:end}.ME2eMO7C1Tk- .ywNldZ-YzEE-{position:relative;font-size:var(--original-price-font-size, inherit);color:var(--original-price-color, inherit)}.ME2eMO7C1Tk- .ywNldZ-YzEE-:before{content:"";left:0;right:0;position:absolute;top:43%;border-bottom:1.5px solid #738895;transform:skewY(-8deg);box-shadow:0 0 2px #000}.ME2eMO7C1Tk- .DOnsaVcV0Is-{font-size:var(--final-price-font-size, inherit);color:var(--final-price-color, inherit)}@keyframes m8o1dcaA9nY-{0%{opacity:0}}@keyframes MgI1vEuUsqE-{0%{background-position:0 100%}to{background-position:100% 0}}@keyframes DdWcJspeHns-{0%{background:#3d4450}to{background:#23262e}}@keyframes _7oE4zLcHjdQ-{0%{background:#3d4450;color:#8b929a}to{background:#23262e;color:#fff}}@keyframes zz5u1HFpgNU-{0%{background:#ffffff40;color:#8b929a}to{background:#ffffff26;color:#fff}}@keyframes BUFXFGQP9Gs-{0%{background:#8b929a;color:#fff}to{background:#67707b;color:#fff}}@keyframes fMP0VfJIbPg-{0%{background:#ffffff4d;color:#fff}to{background:#ffffff1a;color:#fff}}@keyframes dVMbtgn4Whs-{0%{background:#ffffff80;color:#fff}to{background:#fff3;color:#fff}}@keyframes l7pXZguduCo-{0%{border-color:#67707b}to{border-color:#3d4450}}@keyframes VQNbBo8A804-{0%{background:#c9ffc9;color:#8b929a}to{background:#59bf40;color:#fff}}@keyframes _7XOpRmzNKi0-{0%{background-position:0% 0%;opacity:1}to{background-position:-180% 0%;opacity:.8}}@keyframes l-HXOknTs7g-{0%{background-position:0% 0%}to{background-position:50% 0%}}@keyframes _9RJyOBZkv0I-{0%{opacity:0;transform:translateY(50px);transform:scale(1)}to{opacity:1;transform:translateY(0);transform:scale(1)}}input::placeholder{font-style:italic}@property --GradientColor1{syntax: "<color>"; initial-value: #81399A; inherits: false;}@property --GradientColor2{syntax: "<color>"; initial-value: #0094A2; inherits: false;}@keyframes AUSFtgMHqZk-{0%{background-position:0% 0%;opacity:1}to{background-position:-180% 0%;opacity:.8}}@keyframes _---TIKL-l4M-{0%{background-position:0% 0%}to{background-position:50% 0%}}@keyframes HN-1eGY9Nmo-{0%{background-position:0 100%}to{background-position:100% 0}}@keyframes _4ZiGgSYhigE-{0%{background:#3d4450}to{background:#23262e}}@keyframes arvRRZ9-C9Y-{0%{background:#3d4450;color:#8b929a}to{background:#23262e;color:#fff}}@keyframes _9jyy72RowfQ-{0%{background:#ffffff40;color:#8b929a}to{background:#ffffff26;color:#fff}}@keyframes _0vm28U-NXYE-{0%{background:#8b929a;color:#fff}to{background:#67707b;color:#fff}}@keyframes Omlo74OCNh4-{0%{background:#ffffff4d;color:#fff}to{background:#ffffff1a;color:#fff}}@keyframes _4y-sz5WDrKM-{0%{background:#ffffff80;color:#fff}to{background:#fff3;color:#fff}}@keyframes yVxuhcF-Jqo-{0%{border-color:#67707b}to{border-color:#3d4450}}@keyframes DGu9xeM67Ec-{0%{background:#c9ffc9;color:#8b929a}to{background:#59bf40;color:#fff}}:root{--indent-level: 0;--field-negative-horizontal-margin: 0px;--field-row-children-spacing: 0px}@keyframes UM0fZCgqJds-{0%{opacity:0;transform:translateY(50px);transform:scale(1)}to{opacity:1;transform:translateY(0);transform:scale(1)}}@keyframes ELqxp2DLKF8-{0%{background-position:0 100%}to{background-position:100% 0}}@keyframes o0VXPmdxuUc-{0%{background:#3d4450}to{background:#23262e}}@keyframes vn2pzERIjAA-{0%{background:#3d4450;color:#8b929a}to{background:#23262e;color:#fff}}@keyframes _3-IWLVbzoio-{0%{background:#ffffff40;color:#8b929a}to{background:#ffffff26;color:#fff}}@keyframes _7kx878X5F4U-{0%{background:#8b929a;color:#fff}to{background:#67707b;color:#fff}}@keyframes _47U-YjIajBc-{0%{background:#ffffff4d;color:#fff}to{background:#ffffff1a;color:#fff}}@keyframes T7MuEoxoS4g-{0%{background:#ffffff80;color:#fff}to{background:#fff3;color:#fff}}@keyframes rEWG7AndCQc-{0%{border-color:#67707b}to{border-color:#3d4450}}@keyframes FMEBbK-Sl-8-{0%{background:#c9ffc9;color:#8b929a}to{background:#59bf40;color:#fff}}@keyframes _08jd-D3p5XU-{0%{background-position:0% 0%;opacity:1}to{background-position:-180% 0%;opacity:.8}}@keyframes P1X-i3YFXCU-{0%{background-position:0% 0%}to{background-position:50% 0%}}@keyframes rZZpaXvr8xw-{0%{background-position:0 100%}to{background-position:100% 0}}@keyframes F1Gvr3xtsjQ-{0%{background:#3d4450}to{background:#23262e}}@keyframes aiPJtdOz5TQ-{0%{background:#3d4450;color:#8b929a}to{background:#23262e;color:#fff}}@keyframes tDpKQmHutBk-{0%{background:#ffffff40;color:#8b929a}to{background:#ffffff26;color:#fff}}@keyframes ADELUD39uD4-{0%{background:#8b929a;color:#fff}to{background:#67707b;color:#fff}}@keyframes _0Mx6icQvg2A-{0%{background:#ffffff4d;color:#fff}to{background:#ffffff1a;color:#fff}}@keyframes jax3iKWCNi4-{0%{background:#ffffff80;color:#fff}to{background:#fff3;color:#fff}}@keyframes kIPtFrURqQk-{0%{border-color:#67707b}to{border-color:#3d4450}}@keyframes nHBdcYV-iW0-{0%{background:#c9ffc9;color:#8b929a}to{background:#59bf40;color:#fff}}@keyframes SknjTtzI4lo-{0%{transform:scale(1.4)}}@keyframes pDBWpRO7L-A-{0%{transform:translate(0)}5%{transform:translate(-4px)}15%{transform:translate(4px)}25%{transform:translate(-4px)}35%{transform:translate(4px)}45%{transform:translate(-4px)}55%{transform:translate(4px)}65%{transform:translate(-4px)}75%{transform:translate(3px)}85%{transform:translate(-3px)}to{transform:translate(0)}}@keyframes Sszr8hrC6Ks-{0%{background-position-x:calc(0% - 250px)}to{background-position-x:calc(100% + 250px)}}::-webkit-scrollbar{height:12px;width:14px;background:transparent;z-index:12;overflow:visible}::-webkit-scrollbar-thumb{width:10px;background-color:#434953;border-radius:10px;z-index:12;border:4px solid rgba(0,0,0,0);background-clip:padding-box;transition:background-color .32s ease-in-out;margin:4px;min-height:32px;min-width:32px}::-webkit-scrollbar-thumb:hover{background-color:#4e5157}::-webkit-scrollbar-corner{background:#202020}._5b8C30zCFXs-{border-radius:2px;padding:1px;border:none;display:inline-block;cursor:pointer;background:transparent;text-shadow:1px 1px 0px rgba(0,0,0,.3)}._5b8C30zCFXs->span{padding:0 15px;font-size:15px;line-height:32px;display:block;border-radius:2px;white-space:nowrap}._5b8C30zCFXs-:hover{color:#fff}._5b8C30zCFXs-:disabled,._5b8C30zCFXs-:disabled:hover{color:#464d58;box-shadow:none;cursor:default;pointer-events:none}._5b8C30zCFXs-:disabled>span{background:#3d434d59}a._5b8C30zCFXs-{text-decoration:none}._5b8C30zCFXs-{color:#d2efa9}._5b8C30zCFXs->span{background:linear-gradient(to right,#75b022 5%,#588a1b 95%)}._5b8C30zCFXs-:hover>span{background:linear-gradient(to right,#8ed629 5%,#6aa621 95%)}@keyframes U22zlbIZu1U-{0%{-webkit-transform:rotate(0deg);transform:rotate(0)}to{-webkit-transform:rotate(360deg);transform:rotate(360deg)}}@keyframes L-E7DWJUUoQ-{0%{opacity:50%}50%{opacity:100%}to{opacity:50%}}.pAoL4PrPWdg-{min-height:170px;transition:min-height .3s}.LSY1zV2DJSM-{display:grid;grid-template-columns:fit-content(0) 292px auto auto;grid-template-rows:32px 32px 32px auto;grid-template-areas:"dragger capsule upper upper" "dragger capsule lower remove" "dragger capsule mid purchase" "dragger capsule platform purchase";gap:2px 12px;box-sizing:border-box;position:relative;padding-inline:0px 12px;padding-block:12px;background-color:#405163e6;color:#b2b8bd;transition:background-color .3s,opacity .3s;font-family:"Motiva Sans",Sans-serif;font-weight:200;box-shadow:0 0 5px #0003;height:160px;margin-bottom:10px;transition:padding .3s,height .3s,margin-bottom .3s}.LSY1zV2DJSM-.mYGhH-Z5fCw-{background-color:#3d434ac4}.LSY1zV2DJSM-.mYGhH-Z5fCw- .Fuz2JeT4RfI-{color:#999;font-weight:400;font-size:18px}@media screen and (max-width:910px){html:not(.force_desktop) .LSY1zV2DJSM-:not(.XNnjz6jit-E-){padding-block:8px;grid-template-columns:fit-content(0) 220px auto;grid-template-rows:32px 22px 22px 20px 42px;grid-template-areas:"dragger capsule upper" "dragger capsule lower" "dragger capsule mid" "dragger capsule platform" "dragger purchase purchase"}}@media screen and (max-width:910px){.LSY1zV2DJSM-:not(.XNnjz6jit-E-){grid-template-columns:fit-content(0) 305px auto auto;grid-template-rows:32px 22px 22px auto;grid-template-areas:"dragger capsule upper upper" "dragger capsule lower lower" "dragger capsule mid mid" "dragger capsule platform purchase"}}@media screen and (max-width:500px){html:not(.force_desktop) .LSY1zV2DJSM-:not(.XNnjz6jit-E-){aspect-ratio:461/338;height:unset;width:100%;padding-block:8px;margin-block:0 10px;grid-template-columns:fit-content(0) fit-content(100px) auto auto;grid-template-rows:fit-content(0) 28px 22px 22px 42px;grid-template-areas:"dragger capsule capsule capsule" "dragger upper upper upper" "dragger lower lower lower" "dragger platform mid mid" "dragger remove purchase purchase"}.pAoL4PrPWdg- html:not(.force_desktop) .LSY1zV2DJSM-{aspect-ratio:461/318}}.LSY1zV2DJSM- .oVvbc-NOBF8-{position:relative;grid-area:capsule}.LSY1zV2DJSM- .oVvbc-NOBF8-,.LSY1zV2DJSM- .oVvbc-NOBF8- .S4P-Tu6KIaQ-{width:100%;height:auto;display:block;transition:height .3s,width .3s,margin .3s}.LSY1zV2DJSM- .oVvbc-NOBF8- img{display:block}.LSY1zV2DJSM- .oVvbc-NOBF8- .TjfbNdRyip4-{position:absolute;inset:0}@media screen and (max-width:500px){html:not(.force_desktop) .LSY1zV2DJSM- .oVvbc-NOBF8- .TjfbNdRyip4-{display:flex;flex-direction:row;justify-content:center;position:relative;width:100%}}.LSY1zV2DJSM- .Fuz2JeT4RfI-{color:#fff;font-size:22px;line-height:1.3;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;min-width:0}@media screen and (max-width:910px){html:not(.force_desktop) .LSY1zV2DJSM- .Fuz2JeT4RfI-{font-size:18px;line-height:1.7}}.mqs4M3PcF-A-{grid-area:dragger}@media screen and (max-width:500px){html:not(.force_desktop) .mqs4M3PcF-A-{display:none}}.pMrnNJp5sDA-{display:flex;margin:0;align-items:baseline;transition:margin .3s;grid-area:upper;overflow:hidden}.pMrnNJp5sDA- .Fuz2JeT4RfI-{flex:1}.j7Wl8MzErkA-{display:flex;flex-direction:row;grid-area:mid;align-self:center}@media screen and (max-width:500px){html:not(.force_desktop) .j7Wl8MzErkA-{justify-self:flex-end;align-self:center}}.xlAKnJ50oYQ-{font-size:14px}.DUS6KmDUKhc-{flex:1;display:grid;grid-template-columns:minmax(140px,min-content) auto;column-gap:1ch;grid-template-rows:auto;text-transform:uppercase;white-space:nowrap;font-size:11px}@media screen and (max-width:910px){html:not(.force_desktop) .DUS6KmDUKhc-{display:flex}html:not(.force_desktop) .DUS6KmDUKhc- .yrG419d95pU-{display:none}html:not(.force_desktop) .DUS6KmDUKhc- .mOoPKvox-wE-{margin-right:8px}}.DUS6KmDUKhc- .mOoPKvox-wE-{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px}._7zQ9up20PmA-{min-height:36px;grid-area:purchase;justify-self:flex-end;align-self:flex-end}@media screen and (max-width:500px){html:not(.force_desktop) ._7zQ9up20PmA-{justify-self:flex-end}}.wzQIocnKXn4-{background-color:#0003;padding:2px;display:flex}._-6uwAFLL9K0-{display:flex;flex-direction:row;gap:12px;grid-area:platform}._-6uwAFLL9K0- .DKmMkONAXgw-{color:#000;display:inline-block;font-weight:500;background-color:#67c1f5;padding:0 6px;line-height:20px;height:20px;font-size:12px;cursor:default}@media screen and (max-width:430px){._-6uwAFLL9K0- .DKmMkONAXgw-{display:none}}@media screen and (max-width:910px){html:not(.force_desktop) ._-6uwAFLL9K0-{pointer-events:none;align-self:center}}@media screen and (max-width:500px){html:not(.force_desktop) ._-6uwAFLL9K0-{align-self:center}}._93IWcQLinlA-{display:flex;justify-content:space-between;align-items:flex-start;grid-area:lower;overflow:hidden}@media screen and (max-width:500px){html:not(.force_desktop) ._93IWcQLinlA-{max-width:100%;overflow:hidden;gap:20px}}._7GG-Yb2cOxg-{overflow:hidden;white-space:nowrap;display:flex;flex-direction:row;gap:4px}.jHvUCZyctAM-{display:flex;flex-direction:row;align-items:center;padding:2px 5px;border:1px solid rgba(255,255,255,.2);color:#8f98a0;border-radius:3px;cursor:pointer;height:13px;background:transparent;font-size:11px;font-family:inherit;box-sizing:content-box}.jHvUCZyctAM-:hover{background:#ffffff1a}._80azkrfBXSM-{opacity:0;transition:opacity .3s}._80azkrfBXSM-:hover{opacity:1}._80azkrfBXSM-:hover img.yO-tcJ7evNI-{animation-play-state:running}._80azkrfBXSM- img.yO-tcJ7evNI-{display:block;position:absolute;height:100%;width:100%;animation:eitwc1WYNXM- 4s linear;animation-iteration-count:infinite;animation-play-state:paused;object-fit:cover;object-position:center center;opacity:0}._80azkrfBXSM- img.yO-tcJ7evNI-:nth-child(1){animation-delay:0s}._80azkrfBXSM- img.yO-tcJ7evNI-:nth-child(2){animation-delay:1s}._80azkrfBXSM- img.yO-tcJ7evNI-:nth-child(3){animation-delay:2s}._80azkrfBXSM- img.yO-tcJ7evNI-:nth-child(4){animation-delay:3s}@keyframes eitwc1WYNXM-{0%{opacity:0}3%{opacity:1}28%{opacity:1}31%{opacity:0}}.s3BAyjuoPYA-{width:40px;border-right:1px solid rgba(0,0,0,.2);display:flex;flex-direction:column;align-items:center}.s3BAyjuoPYA- .dIPGtN9kABg->input{width:22px;color:#b9bfc6;background-color:transparent;border-radius:3px;font-size:11px;padding:3px 4px;border:none;text-align:center;transition:background-color .3s,box-shadow .3s}.s3BAyjuoPYA-:hover .dIPGtN9kABg->input{background-color:#313c48;box-shadow:1px 1px #0003 inset}@keyframes loading_throbber_bar{0%{transform:scaleX(1) scaleY(.6)}30%{transform:scaleX(1) scaleY(1)}55%{transform:scaleX(1) scaleY(.6)}to{transform:scaleX(1) scaleY(.6)}}.Z5L0rRmLkfY-{height:20px;align-items:center;display:flex;flex-direction:row;gap:4px}.Z5L0rRmLkfY- .wIs-huKXogw-{display:flex}.Z5L0rRmLkfY- .wIs-huKXogw->svg{width:20px;height:20px;fill:#fff;color:#fff}.Z5L0rRmLkfY- .wIs-huKXogw-.MwfzdHXmZTc->svg{width:15px;height:15px}.Z5L0rRmLkfY- .wIs-huKXogw-.EdGS6nZmIig->svg{width:16px;height:16px}.Z5L0rRmLkfY- .wIs-huKXogw-.oWE-ATskiSE->svg{width:16px;height:16px;margin-top:-2px}@keyframes _0DHNUQDQJ8E-{to{stroke-dashoffset:-232}}@keyframes mSFAQbdPBQw-{0%{fill:#67c1f500}50%{fill:#67c1f50d}to{fill:#67c1f500}}@keyframes sGOn6YG082s-{0%{opacity:0;transform:scale(.75);stroke-width:4px}20%{opacity:.3}40%{opacity:0}50%{opacity:0;transform:scale(5);stroke-width:0px}to{opacity:0;transform:scale(5);stroke-width:0px}}@keyframes v7P-CuB1Oyc-{0%{opacity:0}40%{opacity:1}80%{opacity:0}to{opacity:0}}@keyframes aGGryfTim7A-{to{stroke-dashoffset:-1100}}.cWLPuFe-zxc-{color:#929396}.cWLPuFe-zxc-.MbdBgOhlg7c-{color:#66c0f4}.iiFX76jX8MI-{display:block;transition:opacity .25s}';
/*
    let cssText = "";
    
    // inline <style> tags
    document.querySelectorAll("style").forEach(style => {
      cssText += style.textContent + "\n";
    });

    // external stylesheets
    async function readSheet(sheet) {
      try {
        if (sheet.href) {
          const res = await fetch(sheet.href);
          return await res.text();
        }
      } catch (e) {
        console.warn("Skipping stylesheet due to CORS:", sheet.href);
      }
      return "";
    }

    for (let sheet of document.styleSheets) {
      cssText += await readSheet(sheet);
    }
*/


    // ---------- 10. Build final standalone file ----------
    const clientScript = `document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll("[data-discount-end]").forEach(n=>{try{const t=new Date(n.getAttribute("data-discount-end"));if(isNaN(t.getTime()))return;if(t<=new Date){if(container=n.querySelector(".MKj0TKJbfZY-"),priceContainer=container.querySelector(".ME2eMO7C1Tk-"),oldPrice=priceContainer.querySelector(".ywNldZ-YzEE-"),newPrice=priceContainer.querySelector(".DOnsaVcV0Is-"),priceContainer&&oldPrice&&newPrice){priceContainer.removeChild(newPrice),oldPrice.parentNode.remove();const c=document.createElement("div");c.className="ME2eMO7C1Tk-";const o=document.createElement("div");o.className="DOnsaVcV0Is-",o.textContent=oldPrice.textContent.trim(),c.appendChild(o),container.appendChild(c)}discountSpan=container.querySelector(".bWcsWKN3D84-"),discountSpan.remove();var e=n.querySelector(".DOnsaVcV0Is-");const r=n.querySelector(".ywNldZ-YzEE-");r&&e&&(r.style.display="inline")}}catch(e){console.log("Error processing data-discount-end for element",n,e)}})});`;
    /*
    document.addEventListener("DOMContentLoaded", function() {
    console.log("Running client-side discount expiration script");
      document.querySelectorAll("[data-discount-end]").forEach(el => {
        console.log("Processing element with data-discount-end");
        try {
          const endDate = new Date(el.getAttribute("data-discount-end"));
          console.log("Discount ended on", endDate);
          console.log("Current date is", new Date());
          if (isNaN(endDate.getTime())) return; // invalid date guard
          if (endDate <= new Date()) {
            console.log("Hiding discount for element");

            container = el.querySelector('.MKj0TKJbfZY-');
            priceContainer = container.querySelector('.ME2eMO7C1Tk-');
            oldPrice = priceContainer.querySelector('.ywNldZ-YzEE-');
            newPrice = priceContainer.querySelector('.DOnsaVcV0Is-');


            if (priceContainer && oldPrice && newPrice) {
                priceContainer.removeChild(newPrice);
                oldPrice.parentNode.remove();

                // Build the new structure
                const newME = document.createElement('div');
                newME.className = 'ME2eMO7C1Tk-';

                const price = document.createElement('div');
                price.className = 'DOnsaVcV0Is-';
                //price.style.display = 'inline';
                price.textContent = oldPrice.textContent.trim();

                newME.appendChild(price);
                container.appendChild(newME);
            }
            
            // hide discount % and discounted price
            discountSpan = container.querySelector(".bWcsWKN3D84-");
            discountSpan.remove();

            const discountedPrice = el.querySelector(".DOnsaVcV0Is-");
            const originalPrice = el.querySelector(".ywNldZ-YzEE-");
            if (originalPrice && discountedPrice) {
              //discountedPrice.style.display = "none";
              originalPrice.style.display = "inline";
            }
          }
        } catch (e) {
          console.warn("Error processing data-discount-end for element", el, e);
        }
      });
    });*/

    const outputHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${cssText}</style></head><body style="background:#1b2838;">${clone.outerHTML}<script>${clientScript}</script></body></html>`;

    // ---------- 7. Download as a single HTML file ----------
    const blob = new Blob([outputHTML], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "steam_wishlist.html";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus('Wishlist exported')

  } catch (err) {
    console.error("Export failed:", err);
    setStatus(err.message);
    alert("Export failed: " + err.message);
  }
})();

async function fetchDiscountEnd(url) {
  try {
    const res = await fetch(url, { credentials: "include" });
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "text/html");

    // --------------------------------------------------------------
    // 1. Try finding Steam's InitDailyDealTimer() epoch timestamp
    // --------------------------------------------------------------
    // Example in HTML:
    // InitDailyDealTimer( $DiscountCountdown, 1764266400 );
    const epochMatch = text.match(/InitDailyDealTimer\s*\([^,]+,\s*(\d{9,12})\s*\)/);

    if (epochMatch) {
      const epochSeconds = parseInt(epochMatch[1], 10);

      const endDate = new Date(epochSeconds * 1000);

      chrome.runtime.sendMessage({
        type: "log",
        message: `Detected countdown epoch: ${epochSeconds} → ${endDate.toISOString()}`
      });

      return endDate;
    }

    chrome.runtime.sendMessage({
      type: "log",
      message: "No countdown epoch found; falling back to date text."
    });

    // --------------------------------------------------------------
    // 2. Fallback: Normal Dutch date extraction (e.g. “5 december”)
    // --------------------------------------------------------------

    const countdownEl = doc.querySelector(".game_purchase_discount_countdown");
    if (!countdownEl) return null;

    const raw = countdownEl.textContent.trim();

    // Match: "<num> <month>"
    const dateMatch = raw.match(/(\d{1,2})\s+([a-z]+)/i);
    if (!dateMatch) {
      chrome.runtime.sendMessage({
        type: "log",
        message: `No fallback date found in text: "${raw}"`
      });
      return null;
    }

    const day = parseInt(dateMatch[1], 10);
    const monthDutch = dateMatch[2].toLowerCase();

    const monthMap = {
      januari: 0, februari: 1, maart: 2, april: 3,
      mei: 4, juni: 5, juli: 6, augustus: 7,
      september: 8, oktober: 9, november: 10, december: 11
    };

    const month = monthMap[monthDutch];
    if (month == null) {
      chrome.runtime.sendMessage({
        type: "log",
        message: `Unknown month: ${monthDutch}`
      });
      return null;
    }

    const now = new Date();
    let year = now.getFullYear();

    let endDate = new Date(year, month, day, 23, 59, 59);

    if (endDate <= now) {
      year++;
      endDate = new Date(year, month, day, 23, 59, 59);
    }

    chrome.runtime.sendMessage({
      type: "log",
      message: `Parsed fallback date: ${endDate.toISOString()} (“${raw}”)`
    });

    return endDate;

  } catch (e) {
    chrome.runtime.sendMessage({ type: "log", message: `fetchDiscountEnd() error: ${e}` });
    return null;
  }
}




function toNextOccurrence(day, monthIndex) {
    const now = new Date();
    let year = now.getFullYear();

    let d = new Date(year, monthIndex, day);

    if (d < now) {
        d = new Date(year + 1, monthIndex, day);
    }

    return d;
}

function parseSteamExpirationToRealDate(text) {
    if (!text || typeof text !== "string") return null; // prevents str.match error

    const months = [
        "jan", "feb", "mar", "apr", "may", "jun",
        "jul", "aug", "sep", "oct", "nov", "dec"
    ];

    const m = text.toLowerCase().match(/(\d{1,2})\s*([a-zA-Z]+)/);
    if (!m) return null;

    const day = parseInt(m[1], 10);
    const monthName = m[2];

    const monthIndex = months.findIndex(mo => monthName.startsWith(mo));
    if (monthIndex < 0) return null;

    return toNextOccurrence(day, monthIndex);
}