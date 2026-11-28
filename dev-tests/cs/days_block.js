      for (const [i, p] of ps.entries()) {
        const vv = V(p);
        if (!(vv.me.acts >= 2 && vv.me.acts <= 5)) GX.actsRange = false;
        if (GX.chalDone[d - 1] && GX.chalDone[d - 1].includes(i)) { GX.bonusChecked++; if (vv.me.acts < 3) GX.bonusOk = false; }
        if (vv.me.canFish && !GX.fished) {
          const a0 = vv.me.acts;
          const st0 = await mv(p, { act: "fish", start: true });
          await wait(150);
          const early = await mv(p, { act: "fish", progress: 1 });
          await wait(3200);
          const fin = await mv(p, { act: "fish", progress: 1, kind: "golden", p: 0, cash: 999 });
          await wait(150);
          const f = V(p).me.fish;
          const okCatch = f && f.done && f.caught && (f.caught.kind === "boot" ? f.caught.cash === 5 : V(p).sets[f.caught.p].on);
          check(tag, "fishing: costs an action, too-early refused, server-rolled catch", st0.ok && V(p).me.acts === a0 - 1 && !early.ok && fin.ok && okCatch, JSON.stringify(f && f.caught));
          check(tag, "fishing: once a day", !(await mv(p, { act: "fish", start: true })).ok);
          check(tag, "fishing state private", !JSON.stringify(T(tv)).includes('"caught"') && !JSON.stringify({ ...V(ps[(i + 1) % n]), me: null }).includes('"caught"'));
          GX.fished = true;
          continue;
        }
        if (i === n - 1 && n > 1) {
          // the spender: blows the budget on the priciest bundle it can afford, keeps everything sealed and off the table
          for (let a = 0; a < 2; a++) {
            const s2 = V(p).stock.filter((x) => x.q > 0).map((x) => ({ x, k: Math.min(3, x.q, Math.floor(V(p).me.cash / x.price)) })).filter((y) => y.k > 0).sort((y, z) => z.k * z.x.price - y.k * y.x.price)[0];
            if (s2 && V(p).me.acts > 0) await mv(p, { act: "pack", p: s2.x.p, n: s2.k });
            await wait(60);
          }
          continue;
        }
        const st = vv.stock.filter((x) => x.q > 0 && x.price <= vv.me.cash - 20);
        if (st.length && vv.me.acts > 0) {
          const k = Math.min(3, st[0].q, Math.floor((vv.me.cash - 20) / st[0].price));
          await mv(p, { act: "pack", p: st[0].p, n: k });
          for (let j = 0; j < k; j++) await mv(p, { act: "rip", p: st[0].p });
        }
      }
