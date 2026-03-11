/**
 * Exhaustive country → OSM admin_level mapping.
 * Based on https://wiki.openstreetmap.org/wiki/Tag:boundary%3Dadministrative
 *
 * Each entry maps an ISO 3166-1 alpha-2 country code (lowercase) to an ARRAY
 * of all meaningful OSM admin levels for that country, from largest to smallest.
 * Levels with >5000 expected items are generally omitted (use city search instead).
 *
 * Labels are in French where a common translation exists.
 */

export const ADMIN_LEVELS = {

    // ─── Europe ──────────────────────────────────────────────────────────────

    fr: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '6', label: 'Départements' },
        { adminLevel: '7', label: 'Arrondissements' }
    ],
    de: [
        { adminLevel: '4', label: 'Länder' },
        { adminLevel: '5', label: 'Regierungsbezirke' },
        { adminLevel: '6', label: 'Kreise' }
    ],
    at: [
        { adminLevel: '4', label: 'Länder' },
        { adminLevel: '6', label: 'Bezirke' }
    ],
    ch: [
        { adminLevel: '4', label: 'Cantons' },
        { adminLevel: '6', label: 'Districts' }
    ],
    it: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '6', label: 'Provinces' }
    ],
    es: [
        { adminLevel: '4', label: 'Communautés autonomes' },
        { adminLevel: '5', label: 'Provinces' },
        { adminLevel: '6', label: 'Comarques' }
    ],
    pt: [
        { adminLevel: '4', label: 'Régions statistiques' },
        { adminLevel: '6', label: 'Sous-régions' },
        { adminLevel: '7', label: 'Intermunicipales' }
    ],
    gb: [
        { adminLevel: '4', label: 'Nations' },
        { adminLevel: '5', label: 'Régions (Angleterre)' },
        { adminLevel: '6', label: 'Comtés / Unitaires' }
    ],
    ie: [
        { adminLevel: '5', label: 'Provinces' },
        { adminLevel: '6', label: 'Comtés' }
    ],
    nl: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '8', label: 'Communes' }
    ],
    be: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Provinces' },
        { adminLevel: '6', label: 'Arrondissements' }
    ],
    lu: [
        { adminLevel: '6', label: 'Cantons' }
    ],
    dk: [
        { adminLevel: '4', label: 'Régions' }
    ],
    se: [
        { adminLevel: '4', label: 'Comtés' }
    ],
    no: [
        { adminLevel: '4', label: 'Comtés' },
        { adminLevel: '7', label: 'Communes' }
    ],
    fi: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Sous-régions' }
    ],
    is: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '6', label: 'Municipalités' }
    ],
    pl: [
        { adminLevel: '4', label: 'Voïvodies' },
        { adminLevel: '6', label: 'Powiats' }
    ],
    cz: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '6', label: 'Districts' },
        { adminLevel: '7', label: 'Communes à responsabilités élargies' }
    ],
    sk: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '6', label: 'Districts' }
    ],
    hu: [
        { adminLevel: '4', label: 'Grandes régions' },
        { adminLevel: '5', label: 'Régions de planification' },
        { adminLevel: '6', label: 'Comitats' }
    ],
    ro: [
        { adminLevel: '4', label: 'Macrorégions' },
        { adminLevel: '5', label: 'Régions de développement' },
        { adminLevel: '6', label: 'Județe' }
    ],
    bg: [
        { adminLevel: '4', label: 'Régions de planification' },
        { adminLevel: '6', label: 'Provinces' }
    ],
    hr: [
        { adminLevel: '6', label: 'Comitats' }
    ],
    si: [
        { adminLevel: '4', label: 'Régions statistiques' },
        { adminLevel: '6', label: 'Communes' }
    ],
    ba: [
        { adminLevel: '4', label: 'Entités' },
        { adminLevel: '5', label: 'Cantons (FBiH)' },
        { adminLevel: '6', label: 'Municipalités' }
    ],
    rs: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    me: [
        { adminLevel: '6', label: 'Municipalités' }
    ],
    mk: [
        { adminLevel: '4', label: 'Régions statistiques' },
        { adminLevel: '6', label: 'Municipalités' }
    ],
    al: [
        { adminLevel: '4', label: 'Comtés' },
        { adminLevel: '6', label: 'Municipalités' }
    ],
    xk: [
        { adminLevel: '4', label: 'Districts' },
        { adminLevel: '6', label: 'Municipalités' }
    ],
    gr: [
        { adminLevel: '4', label: 'Régions décentralisées' },
        { adminLevel: '5', label: 'Régions' },
        { adminLevel: '6', label: 'Unités régionales' }
    ],
    tr: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '6', label: 'Districts' }
    ],
    cy: [
        { adminLevel: '4', label: 'Districts' }
    ],
    mt: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    ee: [
        { adminLevel: '4', label: 'Comtés' },
        { adminLevel: '5', label: 'Régions' }
    ],
    lv: [
        { adminLevel: '4', label: 'Régions de planification' },
        { adminLevel: '6', label: 'Municipalités' }
    ],
    lt: [
        { adminLevel: '4', label: 'Comtés' },
        { adminLevel: '5', label: 'Municipalités' }
    ],
    ru: [
        { adminLevel: '4', label: 'Sujets fédéraux' },
        { adminLevel: '5', label: 'Okrugs municipaux' },
        { adminLevel: '6', label: 'Raïons' }
    ],
    ua: [
        { adminLevel: '4', label: 'Oblasts' },
        { adminLevel: '6', label: 'Raïons' }
    ],
    by: [
        { adminLevel: '4', label: 'Oblasts' },
        { adminLevel: '6', label: 'Raïons' }
    ],
    md: [
        { adminLevel: '4', label: 'Régions de développement' },
        { adminLevel: '6', label: 'Raïons' }
    ],
    ge: [
        { adminLevel: '4', label: 'Régions / Républiques autonomes' },
        { adminLevel: '6', label: 'Municipalités' }
    ],
    am: [
        { adminLevel: '4', label: 'Marzer' },
        { adminLevel: '6', label: 'Communautés' }
    ],
    az: [
        { adminLevel: '4', label: 'Districts' },
        { adminLevel: '6', label: 'Unités administratives' }
    ],
    ad: [
        { adminLevel: '7', label: 'Paroisses' }
    ],
    li: [
        { adminLevel: '6', label: 'Communes' }
    ],
    sm: [
        { adminLevel: '7', label: 'Castelli' }
    ],

    // ─── Asie ────────────────────────────────────────────────────────────────

    jp: [
        { adminLevel: '4', label: 'Préfectures' },
        { adminLevel: '7', label: 'Comtés / Villes' }
    ],
    cn: [
        { adminLevel: '4', label: 'Provinces / Régions autonomes' },
        { adminLevel: '5', label: 'Préfectures autonomes' },
        { adminLevel: '6', label: 'Préfectures' }
    ],
    tw: [
        { adminLevel: '4', label: 'Comtés / Villes directes' },
        { adminLevel: '5', label: 'Districts / Villes' }
    ],
    kr: [
        { adminLevel: '4', label: 'Provinces / Métropoles' },
        { adminLevel: '5', label: 'Villes / Comtés' },
        { adminLevel: '6', label: 'Districts' }
    ],
    kp: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '6', label: 'Comtés' }
    ],
    mn: [
        { adminLevel: '4', label: 'Aimags' },
        { adminLevel: '6', label: 'Sums' }
    ],
    in: [
        { adminLevel: '3', label: 'Zones' },
        { adminLevel: '4', label: 'États / UT' },
        { adminLevel: '5', label: 'Districts' }
    ],
    pk: [
        { adminLevel: '4', label: 'Provinces / Territoires' },
        { adminLevel: '5', label: 'Divisions' },
        { adminLevel: '6', label: 'Districts' }
    ],
    bd: [
        { adminLevel: '4', label: 'Divisions' },
        { adminLevel: '5', label: 'Districts' },
        { adminLevel: '6', label: 'Sous-districts' }
    ],
    lk: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    np: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    bt: [
        { adminLevel: '4', label: 'Dzongkhags' },
        { adminLevel: '6', label: 'Gewogs' }
    ],
    mm: [
        { adminLevel: '4', label: 'États / Régions' },
        { adminLevel: '5', label: 'Districts' },
        { adminLevel: '6', label: 'Cantonats' }
    ],
    th: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' },
        { adminLevel: '6', label: 'Sous-districts' }
    ],
    vn: [
        { adminLevel: '4', label: 'Provinces / Villes directes' },
        { adminLevel: '5', label: 'Districts / Arrondissements' }
    ],
    la: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    kh: [
        { adminLevel: '4', label: 'Provinces / Municipalités' },
        { adminLevel: '5', label: 'Districts / Khans' }
    ],
    my: [
        { adminLevel: '4', label: 'États / Territoires fédéraux' },
        { adminLevel: '5', label: 'Districts' }
    ],
    id: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Régences / Villes' },
        { adminLevel: '6', label: 'Districts' }
    ],
    ph: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Provinces' },
        { adminLevel: '6', label: 'Villes / Municipalités' }
    ],
    af: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    ir: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Comtés' },
        { adminLevel: '6', label: 'Shahrestans' }
    ],
    iq: [
        { adminLevel: '4', label: 'Gouvernorats' },
        { adminLevel: '6', label: 'Districts' }
    ],
    sy: [
        { adminLevel: '4', label: 'Gouvernorats' },
        { adminLevel: '5', label: 'Districts' },
        { adminLevel: '6', label: 'Sous-districts' }
    ],
    lb: [
        { adminLevel: '4', label: 'Gouvernorats' },
        { adminLevel: '6', label: 'Districts' }
    ],
    jo: [
        { adminLevel: '4', label: 'Gouvernorats' },
        { adminLevel: '5', label: 'Districts' }
    ],
    il: [
        { adminLevel: '4', label: 'Districts' },
        { adminLevel: '6', label: 'Sous-districts' }
    ],
    sa: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Gouvernorats' }
    ],
    ye: [
        { adminLevel: '4', label: 'Gouvernorats' },
        { adminLevel: '5', label: 'Districts' }
    ],
    om: [
        { adminLevel: '4', label: 'Gouvernorats' },
        { adminLevel: '5', label: 'Wilayats' }
    ],
    ae: [
        { adminLevel: '4', label: 'Émirats' }
    ],
    qa: [
        { adminLevel: '5', label: 'Municipalités' }
    ],
    kw: [
        { adminLevel: '5', label: 'Gouvernorats' }
    ],
    bh: [
        { adminLevel: '5', label: 'Gouvernorats' }
    ],
    kz: [
        { adminLevel: '4', label: 'Régions / Villes de statut républicain' },
        { adminLevel: '6', label: 'Districts' }
    ],
    uz: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '6', label: 'Districts' }
    ],
    kg: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '6', label: 'Districts' }
    ],
    tj: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    tm: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],

    // ─── Afrique ─────────────────────────────────────────────────────────────

    ma: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Provinces / Préfectures' },
        { adminLevel: '6', label: 'Communes' }
    ],
    dz: [
        { adminLevel: '4', label: 'Wilayas' },
        { adminLevel: '5', label: 'Daïras' }
    ],
    tn: [
        { adminLevel: '4', label: 'Gouvernorats' },
        { adminLevel: '5', label: 'Délégations' }
    ],
    ly: [
        { adminLevel: '4', label: 'Districts' },
        { adminLevel: '5', label: 'Baladiyat' }
    ],
    eg: [
        { adminLevel: '4', label: 'Gouvernorats' },
        { adminLevel: '6', label: 'Districts' }
    ],
    sd: [
        { adminLevel: '4', label: 'États' },
        { adminLevel: '5', label: 'Localités' }
    ],
    ss: [
        { adminLevel: '4', label: 'États' },
        { adminLevel: '5', label: 'Comtés' }
    ],
    et: [
        { adminLevel: '4', label: 'Régions / Villes char.' },
        { adminLevel: '5', label: 'Zones' },
        { adminLevel: '6', label: 'Woredas' }
    ],
    ke: [
        { adminLevel: '4', label: 'Comtés' },
        { adminLevel: '5', label: 'Sous-comtés' }
    ],
    tz: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    ug: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    rw: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    bi: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Communes' }
    ],
    so: [
        { adminLevel: '4', label: 'Régions fédérales' },
        { adminLevel: '5', label: 'Régions' }
    ],
    er: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    dj: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    ng: [
        { adminLevel: '4', label: 'États' },
        { adminLevel: '5', label: 'Zones de gouvernement local' }
    ],
    gh: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    cm: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Départements' }
    ],
    sn: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Départements' }
    ],
    ml: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Cercles' }
    ],
    ne: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Départements' }
    ],
    bf: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Provinces' }
    ],
    mr: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Moughataas' }
    ],
    tg: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Préfectures' }
    ],
    bj: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Communes' }
    ],
    ci: [
        { adminLevel: '4', label: 'Districts' },
        { adminLevel: '5', label: 'Régions' }
    ],
    gn: [
        { adminLevel: '4', label: 'Régions administratives' },
        { adminLevel: '5', label: 'Préfectures' }
    ],
    sl: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    lr: [
        { adminLevel: '4', label: 'Comtés' },
        { adminLevel: '5', label: 'Districts' }
    ],
    gm: [
        { adminLevel: '4', label: 'Divisions' }
    ],
    gw: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Secteurs' }
    ],
    td: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Départements' }
    ],
    cf: [
        { adminLevel: '4', label: 'Préfectures' },
        { adminLevel: '5', label: 'Sous-préfectures' }
    ],
    cg: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Districts' }
    ],
    cd: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Territoires' }
    ],
    ga: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Départements' }
    ],
    gq: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    ao: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Municipalités' }
    ],
    zm: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    mw: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Districts' }
    ],
    zw: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    mz: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    na: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Circonscriptions' }
    ],
    bw: [
        { adminLevel: '4', label: 'Districts' },
        { adminLevel: '5', label: 'Sous-districts' }
    ],
    za: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Zones métropolitaines' },
        { adminLevel: '6', label: 'Municipalités de district' }
    ],
    sz: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Tinkhundla' }
    ],
    ls: [
        { adminLevel: '4', label: 'Districts' },
        { adminLevel: '5', label: 'Circumscriptions' }
    ],
    mg: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Régions' },
        { adminLevel: '6', label: 'Districts' }
    ],

    // ─── Amériques ───────────────────────────────────────────────────────────

    us: [
        { adminLevel: '3', label: 'Divisions du recensement' },
        { adminLevel: '4', label: 'États' },
        { adminLevel: '6', label: 'Comtés' }
    ],
    ca: [
        { adminLevel: '4', label: 'Provinces / Territoires' },
        { adminLevel: '6', label: 'Divisions du recensement' }
    ],
    mx: [
        { adminLevel: '4', label: 'États' },
        { adminLevel: '5', label: 'Municipios' }
    ],
    br: [
        { adminLevel: '4', label: 'États' },
        { adminLevel: '5', label: 'Mésorégions' },
        { adminLevel: '6', label: 'Microrégions' }
    ],
    ar: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Départements' }
    ],
    cl: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Provinces' }
    ],
    co: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Subregiones' }
    ],
    ve: [
        { adminLevel: '4', label: 'États' },
        { adminLevel: '5', label: 'Municipios' }
    ],
    pe: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Provinces' }
    ],
    ec: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Cantons' }
    ],
    bo: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Provinces' }
    ],
    py: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Districts' }
    ],
    uy: [
        { adminLevel: '4', label: 'Départements' }
    ],
    gt: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Municipios' }
    ],
    hn: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Municipios' }
    ],
    sv: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Municipios' }
    ],
    ni: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Municipios' }
    ],
    cr: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Cantons' }
    ],
    pa: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Districts' }
    ],
    cu: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '5', label: 'Municipios' }
    ],
    ht: [
        { adminLevel: '4', label: 'Départements' },
        { adminLevel: '5', label: 'Arrondissements' }
    ],
    do: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Provinces' }
    ],
    jm: [
        { adminLevel: '4', label: 'Comtés' },
        { adminLevel: '5', label: 'Paroisses' }
    ],
    tt: [
        { adminLevel: '4', label: 'Régions' }
    ],
    gy: [
        { adminLevel: '4', label: 'Régions' }
    ],
    sr: [
        { adminLevel: '4', label: 'Districts' },
        { adminLevel: '5', label: 'Ressorts' }
    ],
    gf: [
        { adminLevel: '6', label: 'Communes' }
    ],
    gp: [
        { adminLevel: '6', label: 'Communes' }
    ],
    mq: [
        { adminLevel: '6', label: 'Communes' }
    ],
    re: [
        { adminLevel: '6', label: 'Communes' }
    ],
    yt: [
        { adminLevel: '6', label: 'Communes' }
    ],

    // ─── Océanie ─────────────────────────────────────────────────────────────

    au: [
        { adminLevel: '4', label: 'États / Territoires' },
        { adminLevel: '6', label: 'Zones de gouvernement local' }
    ],
    nz: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Autorités territoriales' }
    ],
    pg: [
        { adminLevel: '4', label: 'Régions' },
        { adminLevel: '5', label: 'Provinces' }
    ],
    fj: [
        { adminLevel: '4', label: 'Divisions' },
        { adminLevel: '5', label: 'Provinces' }
    ],
    sb: [
        { adminLevel: '4', label: 'Provinces' }
    ],
    vu: [
        { adminLevel: '4', label: 'Provinces' }
    ],
    nc: [
        { adminLevel: '4', label: 'Provinces' },
        { adminLevel: '6', label: 'Communes' }
    ],
    pf: [
        { adminLevel: '4', label: 'Subdivisions' },
        { adminLevel: '6', label: 'Communes' }
    ],
    wf: [
        { adminLevel: '4', label: 'Royaumes traditionnels' }
    ],
};

/**
 * Returns the array of admin_level configs for a given country code.
 * Falls back to a generic 2-level config for unknown countries.
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {{ adminLevel: string, label: string }[]}
 */
export function getAdminLevels(countryCode) {
    const code = (countryCode || '').toLowerCase();
    return ADMIN_LEVELS[code] || [
        { adminLevel: '4', label: 'Admin 1' },
        { adminLevel: '6', label: 'Admin 2' }
    ];
}
