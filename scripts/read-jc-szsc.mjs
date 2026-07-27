const res = await fetch("https://static.sporttery.cn/res_1_0/jcwm/default/jc/szsc/jc_szsc.js");
const js = await res.text();
console.log("len", js.length);
console.log(js);
