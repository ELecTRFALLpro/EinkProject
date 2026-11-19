/**
 * Physical Camera Personas & Skeuomorphic Faceplate Themes mapped to 3D .cube LUTs
 * Each .cube preset drives the real camera illustration, faceplate materials,
 * Polaroid-style top stripe, shutter accent, and LUT color palette badges.
 */

export const CAMERA_THEMES = {
  polaroid_600: {
    id: 'polaroid_600',
    cameraName: 'Polaroid OneStep 600',
    shortBadge: 'ONESTEP 600',
    brand: 'POLAROID',
    filmNote: '经典彩虹拍立得 · 暖黄怀旧胶片感',
    image: 'assets/cameras/polaroid_600.svg',
    lutColors: ['#F4E3C1', '#E38B4F', '#C74437', '#2B211C'],
    stripe: ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#F6F2EA',
      '--cam-body-bottom': '#E7DFD1',
      '--cam-body-border': '#D5CBB8',
      '--cam-text-main': '#24211E',
      '--cam-text-muted': '#766E64',
      '--cam-bezel-outer': '#262422',
      '--cam-bezel-inner': '#141312',
      '--cam-shutter-top': '#F44336',
      '--cam-shutter-bottom': '#C62828',
      '--cam-shutter-ring': '#E2D9C8',
      '--cam-accent': '#E53935'
    }
  },

  polaroid_669: {
    id: 'polaroid_669',
    cameraName: 'Polaroid SX-70 Land',
    shortBadge: 'SX-70 · 669',
    brand: 'POLAROID',
    filmNote: '银棕皮革折叠机 · 青灰冷调撕拉片',
    image: 'assets/cameras/polaroid_669.svg',
    lutColors: ['#D8E2DC', '#9BB1A6', '#B07D56', '#2D302E'],
    stripe: ['#9E653E', '#C48A5E', '#D8D9DB', '#7A8D85', '#3E4643'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#ECEAE6',
      '--cam-body-bottom': '#D8D4CD',
      '--cam-body-border': '#C2BBB0',
      '--cam-text-main': '#242220',
      '--cam-text-muted': '#706960',
      '--cam-bezel-outer': '#3A2B22',
      '--cam-bezel-inner': '#1B1512',
      '--cam-shutter-top': '#E24334',
      '--cam-shutter-bottom': '#B3281C',
      '--cam-shutter-ring': '#C9B39B',
      '--cam-accent': '#A56B43'
    }
  },

  fuji_instax_mini: {
    id: 'fuji_instax_mini',
    cameraName: 'Instax Mini Classic',
    shortBadge: 'INSTAX MINI',
    brand: 'FUJIFILM',
    filmNote: '薄荷奶白拍立得 · 清透日系微甜',
    image: 'assets/cameras/fuji_instax_mini.svg',
    lutColors: ['#F6F7F2', '#B8DDD1', '#F0B6A8', '#3F4E4B'],
    stripe: ['#7ECBB5', '#B2E0D2', '#F7F5EE', '#F3B4A4', '#E67E6E'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#F2F6F4',
      '--cam-body-bottom': '#E0EBE6',
      '--cam-body-border': '#C5D8D0',
      '--cam-text-main': '#20302C',
      '--cam-text-muted': '#647C75',
      '--cam-bezel-outer': '#2B3B37',
      '--cam-bezel-inner': '#161F1D',
      '--cam-shutter-top': '#F06058',
      '--cam-shutter-bottom': '#CD3B34',
      '--cam-shutter-ring': '#D3E4DD',
      '--cam-accent': '#2C9A7A'
    }
  },

  fuji_fp_100c: {
    id: 'fuji_fp_100c',
    cameraName: 'Polaroid 450 Packfilm',
    shortBadge: 'FP-100C PRO',
    brand: 'FUJIFILM',
    filmNote: '专业折腔撕拉片 · 橄榄石墨电影感',
    image: 'assets/cameras/fuji_fp_100c.svg',
    lutColors: ['#D9DDD2', '#7E8774', '#B87C4C', '#242624'],
    stripe: ['#4E5647', '#7A8370', '#BCC2B3', '#D4623F', '#2B2F2B'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#EAEBE5',
      '--cam-body-bottom': '#D5D8CE',
      '--cam-body-border': '#BDC2B5',
      '--cam-text-main': '#21241F',
      '--cam-text-muted': '#676D62',
      '--cam-bezel-outer': '#252924',
      '--cam-bezel-inner': '#121412',
      '--cam-shutter-top': '#E45232',
      '--cam-shutter-bottom': '#B83418',
      '--cam-shutter-ring': '#C4C8BC',
      '--cam-accent': '#5D6B52'
    }
  },

  kodak_portra_400: {
    id: 'kodak_portra_400',
    cameraName: 'Mamiya 7 · Portra',
    shortBadge: 'PORTRA 400',
    brand: 'KODAK',
    filmNote: '香槟沙棕中画幅 · 温润人像肤色',
    image: 'assets/cameras/kodak_portra_400.svg',
    lutColors: ['#F5E6D3', '#E8B878', '#D67D5C', '#382B24'],
    stripe: ['#E2A238', '#F2C56B', '#EDE4D6', '#CA7C54', '#855338'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#F5EFE6',
      '--cam-body-bottom': '#E6DAC9',
      '--cam-body-border': '#D1C1AB',
      '--cam-text-main': '#2B221C',
      '--cam-text-muted': '#7B6D61',
      '--cam-bezel-outer': '#2C231D',
      '--cam-bezel-inner': '#16110E',
      '--cam-shutter-top': '#E44E34',
      '--cam-shutter-bottom': '#B92E18',
      '--cam-shutter-ring': '#DFCFAF',
      '--cam-accent': '#C67A34'
    }
  },

  kodak_ektar_100: {
    id: 'kodak_ektar_100',
    cameraName: 'Kodak Retina · Ektar',
    shortBadge: 'EKTAR 100',
    brand: 'KODAK',
    filmNote: '红银撞色旁轴 · 高饱和明艳色彩',
    image: 'assets/cameras/kodak_ektar_100.svg',
    lutColors: ['#F7E7C4', '#F4B41A', '#C83228', '#222226'],
    stripe: ['#C82E25', '#E86A28', '#F5B82E', '#D9DCDF', '#8B201A'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#F1F2F4',
      '--cam-body-bottom': '#E0E2E6',
      '--cam-body-border': '#C8CCD3',
      '--cam-text-main': '#202124',
      '--cam-text-muted': '#686C74',
      '--cam-bezel-outer': '#321E1D',
      '--cam-bezel-inner': '#171010',
      '--cam-shutter-top': '#E6342A',
      '--cam-shutter-bottom': '#B51D15',
      '--cam-shutter-ring': '#D8DADF',
      '--cam-accent': '#C83228'
    }
  },

  kodachrome_1958: {
    id: 'kodachrome_1958',
    cameraName: 'Leica M3 · 1958',
    shortBadge: 'KODACHROME 58',
    brand: 'KODAK',
    filmNote: '1958 黄铜旁轴 · 纪实醇厚暖调',
    image: 'assets/cameras/kodachrome_1958.svg',
    lutColors: ['#F0DFBE', '#D19A45', '#A93A2B', '#1C1917'],
    stripe: ['#8B6D3B', '#C9A255', '#ECE0C6', '#B53B2A', '#262320'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#EEE8DC',
      '--cam-body-bottom': '#DDD3C1',
      '--cam-body-border': '#C4B7A0',
      '--cam-text-main': '#221E19',
      '--cam-text-muted': '#6E655A',
      '--cam-bezel-outer': '#1F1C18',
      '--cam-bezel-inner': '#0E0C0A',
      '--cam-shutter-top': '#D93B2B',
      '--cam-shutter-bottom': '#A62116',
      '--cam-shutter-ring': '#D4BF96',
      '--cam-accent': '#A67A38'
    }
  },

  fuji_velvia_100f: {
    id: 'fuji_velvia_100f',
    cameraName: 'Fuji GW690 Emerald',
    shortBadge: 'VELVIA 100F',
    brand: 'FUJIFILM',
    filmNote: '翠绿钛金大画幅 · 极艳风光反转片',
    image: 'assets/cameras/fuji_velvia_100f.svg',
    lutColors: ['#E7F0EA', '#1E6F4E', '#D8436A', '#17221E'],
    stripe: ['#14533C', '#1E7A56', '#74B89B', '#D84B78', '#222625'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#EDF2EF',
      '--cam-body-bottom': '#DCE5DF',
      '--cam-body-border': '#C2D0C7',
      '--cam-text-main': '#18241E',
      '--cam-text-muted': '#5E7268',
      '--cam-bezel-outer': '#182620',
      '--cam-bezel-inner': '#0C1410',
      '--cam-shutter-top': '#E23D64',
      '--cam-shutter-bottom': '#B32043',
      '--cam-shutter-ring': '#C4D4CA',
      '--cam-accent': '#1E7A56'
    }
  },

  fuji_provia_100f: {
    id: 'fuji_provia_100f',
    cameraName: 'Fuji Klasse · Provia',
    shortBadge: 'PROVIA 100F',
    brand: 'FUJIFILM',
    filmNote: '钛银钴蓝紧凑机 · 通透写实标准片',
    image: 'assets/cameras/fuji_provia_100f.svg',
    lutColors: ['#EEF2F6', '#336699', '#D65B4F', '#1E242B'],
    stripe: ['#204B7A', '#3B74B5', '#D6DCE3', '#606D7C', '#242A32'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#EFF2F5',
      '--cam-body-bottom': '#DFE4EA',
      '--cam-body-border': '#C6CED8',
      '--cam-text-main': '#1D242C',
      '--cam-text-muted': '#636E7A',
      '--cam-bezel-outer': '#1E2630',
      '--cam-bezel-inner': '#0E1318',
      '--cam-shutter-top': '#E84432',
      '--cam-shutter-bottom': '#BC2618',
      '--cam-shutter-ring': '#CFD7E0',
      '--cam-accent': '#2E629E'
    }
  },

  fuji_astia_100f: {
    id: 'fuji_astia_100f',
    cameraName: 'Contax G2 · Astia',
    shortBadge: 'ASTIA 100F',
    brand: 'FUJIFILM',
    filmNote: '珍珠玫瑰旁轴 · 柔和低反差肤色',
    image: 'assets/cameras/fuji_astia_100f.svg',
    lutColors: ['#FAF2EE', '#DFB6AA', '#C97B6E', '#3A2E2B'],
    stripe: ['#D4A396', '#E8C5BA', '#F7F1ED', '#B97A6D', '#6D5752'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#F7F1ED',
      '--cam-body-bottom': '#EBE0DA',
      '--cam-body-border': '#D8C7BE',
      '--cam-text-main': '#2B2220',
      '--cam-text-muted': '#7D6D68',
      '--cam-bezel-outer': '#2E2523',
      '--cam-bezel-inner': '#171211',
      '--cam-shutter-top': '#E5574D',
      '--cam-shutter-bottom': '#BE342B',
      '--cam-shutter-ring': '#E4CFC8',
      '--cam-accent': '#C4776B'
    }
  },

  fuji_superia_400: {
    id: 'fuji_superia_400',
    cameraName: 'Fuji Natura · Superia',
    shortBadge: 'SUPERIA 400',
    brand: 'FUJIFILM',
    filmNote: '富士绿银便携机 · 街头青绿暗部',
    image: 'assets/cameras/fuji_superia_400.svg',
    lutColors: ['#EBF4EE', '#2E8B57', '#E59A38', '#1C2822'],
    stripe: ['#0E6B3A', '#269B5B', '#F0F2EF', '#E59A38', '#D93829'],
    tone: 'light',
    vars: {
      '--cam-body-top': '#EEF2EF',
      '--cam-body-bottom': '#DCE3DE',
      '--cam-body-border': '#C4CFC7',
      '--cam-text-main': '#1B2720',
      '--cam-text-muted': '#617268',
      '--cam-bezel-outer': '#1B2921',
      '--cam-bezel-inner': '#0D1510',
      '--cam-shutter-top': '#E63D2E',
      '--cam-shutter-bottom': '#B82317',
      '--cam-shutter-ring': '#C9D6CD',
      '--cam-accent': '#1A854A'
    }
  },

  ilford_hp5: {
    id: 'ilford_hp5',
    cameraName: 'Leica M · Ilford HP5',
    shortBadge: 'ILFORD HP5',
    brand: 'ILFORD',
    filmNote: '哑光黑化旁轴 · 高宽容度黑白银盐',
    image: 'assets/cameras/ilford_hp5.svg',
    lutColors: ['#F2F2F0', '#A0A09C', '#4D4D4A', '#141414'],
    stripe: ['#181818', '#4A4A4A', '#8E8E8E', '#D2D2D0', '#F4F4F2'],
    tone: 'dark',
    vars: {
      '--cam-body-top': '#2D2D30',
      '--cam-body-bottom': '#1D1D1F',
      '--cam-body-border': '#3B3B40',
      '--cam-text-main': '#F2F2EE',
      '--cam-text-muted': '#9A9A96',
      '--cam-bezel-outer': '#111113',
      '--cam-bezel-inner': '#070708',
      '--cam-shutter-top': '#E53935',
      '--cam-shutter-bottom': '#AC1F1C',
      '--cam-shutter-ring': '#444448',
      '--cam-accent': '#D8D8D4'
    }
  }
};

export function getCameraTheme(presetId) {
  return CAMERA_THEMES[presetId] || CAMERA_THEMES.polaroid_600;
}

