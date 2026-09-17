from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import textwrap

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "store-assets"
GREEN = "#15534d"
DEEP = "#102f2d"
INK = "#243d3a"
GOLD = "#d5ba68"
PAPER = "#f7f5ed"
MUTED = "#6b7772"
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

def font(size, bold=False):
    return ImageFont.truetype(FONT, size=size, index=8 if bold else 0)

def cover(img, size):
    ratio = max(size[0] / img.width, size[1] / img.height)
    scaled = img.resize((round(img.width*ratio), round(img.height*ratio)), Image.Resampling.LANCZOS)
    x = (scaled.width-size[0])//2; y=(scaled.height-size[1])//2
    return scaled.crop((x,y,x+size[0],y+size[1]))

def contain(img, size):
    ratio = min(size[0]/img.width, size[1]/img.height)
    return img.resize((round(img.width*ratio), round(img.height*ratio)), Image.Resampling.LANCZOS)

def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,*size), radius=radius, fill=255)
    return mask

def fit_text(draw, text, box, max_size, min_size=22, bold=False, spacing=1.25, fill=INK, align="left"):
    x,y,w,h = box
    for sz in range(max_size, min_size-1, -2):
        f=font(sz,bold)
        chars=max(4,int(w/(sz*.62)))
        lines=[]
        for para in text.split("\n"):
            lines += textwrap.wrap(para, width=chars, break_long_words=False) or [""]
        lh=int(sz*spacing)
        if len(lines)*lh <= h:
            for i,line in enumerate(lines):
                if align=="center":
                    bb=draw.textbbox((0,0),line,font=f); tx=x+(w-(bb[2]-bb[0]))/2
                else: tx=x
                draw.text((tx,y+i*lh),line,font=f,fill=fill)
            return

def shadow_card(base, box, radius=32, fill="#fffefa", shadow=18):
    x,y,w,h=box
    layer=Image.new("RGBA",base.size,(0,0,0,0)); d=ImageDraw.Draw(layer)
    d.rounded_rectangle((x,y+8,x+w,y+h+8),radius=radius,fill=(15,38,36,45))
    layer=layer.filter(ImageFilter.GaussianBlur(shadow))
    base.alpha_composite(layer)
    ImageDraw.Draw(base).rounded_rectangle((x,y,x+w,y+h),radius=radius,fill=fill)

def app_header(draw,w,title="달빛 사주", active="오늘"):
    draw.rectangle((0,0,w,126),fill="#fbfaf4")
    draw.text((42,42),"‹",font=font(50),fill=GREEN)
    draw.ellipse((w//2-145,25,w//2-75,95),fill=DEEP,outline=GOLD,width=2)
    draw.text((w//2-125,42),"◐",font=font(28),fill=GOLD)
    draw.text((w//2-60,43),title,font=font(30,True),fill=INK)
    draw.text((w-166,50),"설정",font=font(23),fill=MUTED)

def app_bottom(draw,w,h,active):
    y=h-135
    draw.rounded_rectangle((0,y,w,h+20),radius=34,fill="#fffefa")
    items=["오늘","사주","상담","선택","기록"]
    for i,t in enumerate(items):
        cx=(i+.5)*w/5
        if t==active:
            draw.rounded_rectangle((cx-55,y+10,cx+55,y+112),radius=26,fill=GREEN)
            col="#fffefa"
        else: col="#89918d"
        draw.text((cx,y+28),"◌",anchor="ma",font=font(31),fill=col)
        draw.text((cx,y+79),t,anchor="ma",font=font(22, t==active),fill=col)

def ui_birth(size):
    w,h=size; im=Image.new("RGBA",size,PAPER); d=ImageDraw.Draw(im)
    app_header(d,w); shadow_card(im,(38,150,w-76,h-315),36)
    d.text((w/2,205),"첫 번째 이야기 · 나의 시작",anchor="ma",font=font(23),fill=MUTED)
    fit_text(d,"태어난 순간에서\n나의 이야기가 시작돼요.",(90,260,w-180,150),42,30,True,align="center")
    d.text((74,450),"이름 또는 별명",font=font(24,True),fill=INK)
    fields=[("주연",510,110),("양력",660,100),("2001년   11월   25일",810,100),("오후 12:31",960,100)]
    for text,y,hh in fields:
        d.rounded_rectangle((68,y,w-68,y+hh),radius=24,fill="#fffefa",outline="#ccd3cc",width=2)
        d.text((96,y+hh/2),text,anchor="lm",font=font(27),fill=INK)
    d.rounded_rectangle((68,h-265,w-68,h-175),radius=45,fill=GREEN)
    d.text((w/2,h-220),"관심 주제 선택하기",anchor="mm",font=font(28,True),fill="white")
    return im

def ui_today(size):
    w,h=size; im=Image.new("RGBA",size,PAPER); d=ImageDraw.Draw(im); app_header(d,w)
    bg=cover(Image.open(ROOT/"assets/hanji.webp").convert("RGBA"),(w,h-126)); bg.putalpha(95); im.alpha_composite(bg,(0,126))
    d.text((54,175),"주연님의 오늘",font=font(27),fill=MUTED)
    d.text((54,218),"계사일 · 검은 뱀의 날",font=font(40,True),fill=INK)
    shadow_card(im,(42,300,w-84,340),34)
    d.text((78,344),"오늘의 흐름",font=font(24,True),fill=GREEN)
    fit_text(d,"서두르기보다 기준을 세우면\n마음이 한결 또렷해지는 날이에요.",(78,395,w-156,115),35,28,True)
    d.line((78,540,w-78,540),fill="#d7dad3",width=2)
    d.text((78,570),"좋은 기운  ·  정리와 대화",font=font(24),fill=MUTED)
    shadow_card(im,(42,680,w-84,300),34)
    d.text((78,724),"오늘의 한 걸음",font=font(24,True),fill=GREEN)
    fit_text(d,"미뤄둔 선택 하나를 적고,\n가장 중요한 조건을 표시해보세요.",(78,780,w-156,120),32,25)
    app_bottom(d,w,h,"오늘"); return im

def ui_chat(size):
    w,h=size; im=Image.new("RGBA",size,"#f3f5ef"); d=ImageDraw.Draw(im); app_header(d,w)
    d.rectangle((0,126,w,275),fill="#174b46")
    avatar=cover(Image.open(ROOT/"assets/mentorAvatar.webp").convert("RGBA"),(82,82)); im.paste(avatar,(38,160),rounded_mask((82,82),41))
    d.text((142,165),"달빛 도령",font=font(31,True),fill="white")
    d.text((142,211),"달빛 사주 AI 상담",font=font(21),fill="#d8e6df")
    d.text((w-160,190),"이전 상담",font=font(21),fill="white")
    d.text((42,303),"상담 안내 · 전문적 판단을 대신하지 않습니다",font=font(19),fill=MUTED)
    d.rounded_rectangle((150,375,w-38,485),radius=28,fill="#236457")
    d.text((180,417),"진로에 대한 고민도 있어요",font=font(25,True),fill="white")
    shadow_card(im,(38,535,w-120,405),30)
    fit_text(d,"주연님의 사주를 보면 지금은 가능성을 넓히기보다, 오래 가져갈 기준을 고르는 흐름으로 보여요.\n\n마음이 가장 오래 머무는 일과 현실적으로 지키고 싶은 조건을 하나씩 적어볼까요?",(72,580,w-188,310),27,22,False,1.55)
    d.rounded_rectangle((38,h-245,w-38,h-165),radius=40,fill="#fffefa",outline="#d0d7d0",width=2)
    d.text((80,h-205),"무엇이 고민이신가요?",anchor="lm",font=font(24),fill="#7a817e")
    app_bottom(d,w,h,"상담"); return im

def ui_records(size):
    w,h=size; im=Image.new("RGBA",size,PAPER); d=ImageDraw.Draw(im); app_header(d,w)
    d.text((48,176),"나의 선택 기록",font=font(38,True),fill=INK)
    d.text((48,232),"고민과 결과를 남기며 나만의 기준을 만들어요.",font=font(22),fill=MUTED)
    cards=[("진로","새로운 제안을 받아볼까?","중요 조건 · 성장 가능성",315),
           ("관계","먼저 연락해도 괜찮을까?","결과 기록 완료",575),
           ("생활","이번 달의 작은 목표","진행 중 · 3일째",835)]
    for tag,title,sub,y in cards:
        shadow_card(im,(38,y,w-76,220),30)
        d.rounded_rectangle((70,y+35,150,y+76),radius=20,fill="#e2eee8")
        d.text((110,y+55),tag,anchor="mm",font=font(20,True),fill=GREEN)
        d.text((70,y+105),title,font=font(28,True),fill=INK)
        d.text((70,y+158),sub,font=font(21),fill=MUTED)
    app_bottom(d,w,h,"기록"); return im

SCENES=[
    ("01-birth","나를 읽는\n첫 시작","태어난 순간부터 이어진\n나의 흐름을 살펴보세요",ui_birth),
    ("02-today","오늘의 흐름을\n한눈에","매일 달라지는 기운과\n지금 필요한 한 걸음",ui_today),
    ("03-chat","달빛 도령과\n깊이 있는 상담","사주 흐름을 바탕으로\n고민을 차분히 정리해요",ui_chat),
    ("04-records","선택을 기록하고\n나를 알아가기","고민과 결과를 돌아보며\n나만의 기준을 만들어요",ui_records),
]

def marketing_screen(size, scene, tablet=False):
    w,h=size; key,title,sub,renderer=scene
    splash=cover(Image.open(ROOT/"assets/splash.webp").convert("RGB"),size).convert("RGBA")
    splash=Image.blend(splash,Image.new("RGBA",size,DEEP),.70)
    d=ImageDraw.Draw(splash)
    top=int(h*.065); textw=int(w*(.78 if not tablet else .44))
    fit_text(d,title,(int(w*.08),top,textw,int(h*.13)),int(w*.072 if not tablet else w*.052),32,True,1.05,"#fffdf5")
    fit_text(d,sub,(int(w*.08),top+int(h*.14),textw,int(h*.075)),int(w*.032 if not tablet else w*.025),22,False,1.3,"#dfe8e2")
    if tablet:
        phone_w=int(w*.42); phone_h=int(phone_w*1.95); px=int(w*.53); py=int((h-phone_h)/2)
    else:
        phone_w=int(w*.82); phone_h=int(phone_w*1.95); px=(w-phone_w)//2; py=int(h*.28)
    phone_h=min(phone_h,h-py+60)
    shadow=Image.new("RGBA",size,(0,0,0,0)); sd=ImageDraw.Draw(shadow)
    sd.rounded_rectangle((px-10,py-10,px+phone_w+10,py+phone_h+10),radius=int(phone_w*.1),fill=(0,0,0,130))
    shadow=shadow.filter(ImageFilter.GaussianBlur(int(w*.025))); splash.alpha_composite(shadow)
    d=ImageDraw.Draw(splash); d.rounded_rectangle((px,py,px+phone_w,py+phone_h),radius=int(phone_w*.08),fill="#0b1716")
    inner=(phone_w-24,phone_h-24); ui=renderer(inner).resize(inner,Image.Resampling.LANCZOS)
    splash.paste(ui,(px+12,py+12),rounded_mask(inner,int(phone_w*.065)))
    return splash.convert("RGB")

def build():
    (OUT/"google-play/phone").mkdir(parents=True,exist_ok=True)
    (OUT/"google-play/tablet-7").mkdir(parents=True,exist_ok=True)
    (OUT/"google-play/tablet-10").mkdir(parents=True,exist_ok=True)
    (OUT/"app-store/iphone-6.5").mkdir(parents=True,exist_ok=True)
    logo=Image.open(ROOT/"resources/logo.png").convert("RGB")
    logo.resize((512,512),Image.Resampling.LANCZOS).save(OUT/"google-play/icon-512.png",optimize=True)
    # 1024x500 feature graphic
    feat=cover(Image.open(ROOT/"assets/splash.webp").convert("RGB"),(1024,500)).convert("RGBA")
    overlay=Image.new("RGBA",feat.size,(9,38,36,110)); feat.alpha_composite(overlay)
    fd=ImageDraw.Draw(feat); mark=contain(logo,(132,132)); feat.paste(mark,(94,78),rounded_mask(mark.size,26))
    fd.text((260,104),"달빛 사주",font=font(68,True),fill="#fffdf5")
    fd.text((263,200),"나를 읽고, 내일을 묻다",font=font(39,True),fill="#f1e8c8")
    fd.text((263,270),"오늘의 흐름부터 마음속 고민까지",font=font(27),fill="#e1e9e4")
    feat.convert("RGB").save(OUT/"google-play/feature-graphic-1024x500.jpg",quality=94,optimize=True)
    for scene in SCENES:
        marketing_screen((1080,1920),scene).save(OUT/"google-play/phone"/(scene[0]+"-1080x1920.jpg"),quality=94,optimize=True)
        marketing_screen((1600,2560),scene,True).save(OUT/"google-play/tablet-7"/(scene[0]+"-1600x2560.jpg"),quality=93,optimize=True)
        marketing_screen((1800,2880),scene,True).save(OUT/"google-play/tablet-10"/(scene[0]+"-1800x2880.jpg"),quality=93,optimize=True)
        marketing_screen((1242,2688),scene).save(OUT/"app-store/iphone-6.5"/(scene[0]+"-1242x2688.jpg"),quality=94,optimize=True)
    previews=[]
    for scene in SCENES:
        p=Image.open(OUT/"google-play/phone"/(scene[0]+"-1080x1920.jpg")).resize((270,480),Image.Resampling.LANCZOS)
        previews.append(p)
    sheet=Image.new("RGB",(1128,536),"#e9ece8")
    for i,p in enumerate(previews): sheet.paste(p,(24+i*276,28))
    sheet.save(OUT/"_preview-contact-sheet.jpg",quality=92,optimize=True)

if __name__=="__main__": build()
