import pygame
import pygame_gui
import random
import math
import sys
from PIL import Image
import os

# ==================== 配置区（可直接修改） ====================
WIDTH, HEIGHT = 1000, 700
FPS = 60
MAX_FIREWORKS = 20
GIF_DURATION_SEC = 3  # 导出 GIF 时长（秒）
GIF_FRAME_RATE = 15   # GIF 帧率

# ==================== 初始化 ====================
pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("烟花模拟 Pro - GUI & GIF")
clock = pygame.time.Clock()

# 创建 UI 管理器
ui_manager = pygame_gui.UIManager((WIDTH, HEIGHT))

# ==================== 颜色定义 ====================
BLACK = (0, 0, 0)
COLORS = [
    (255, 50, 50),    # 红色
    (50, 255, 50),    # 绿色
    (50, 50, 255),    # 蓝色
    (255, 255, 50),   # 黄色
    (255, 50, 255),   # 紫色
    (50, 255, 255),   # 青色
    (255, 150, 50),   # 橙色
    (255, 255, 255),  # 白色
]

# ==================== GUI 元素 ====================
# 标题
pygame.font.init()
font_large = pygame.font.SysFont(None, 32)
title_text = font_large.render("🎆 Fireworks Pro 控制面板", True, (255, 220, 100))

# 滑块
slider_particle_count = pygame_gui.elements.UIHorizontalSlider(
    relative_rect=pygame.Rect((20, 80), (250, 30)),
    start_value=120,
    value_range=(40, 200),
    manager=ui_manager
)
slider_gravity = pygame_gui.elements.UIHorizontalSlider(
    relative_rect=pygame.Rect((20, 140), (250, 30)),
    start_value=0.1,
    value_range=(0.01, 0.5),
    manager=ui_manager
)
slider_explosion_radius = pygame_gui.elements.UIHorizontalSlider(
    relative_rect=pygame.Rect((20, 200), (250, 30)),
    start_value=120,
    value_range=(60, 250),
    manager=ui_manager
)

# 开关
switch_stars = pygame_gui.elements.UISwitch(
    relative_rect=pygame.Rect((20, 260), (180, 30)),
    starting_state=True,
    manager=ui_manager
)
switch_trails = pygame_gui.elements.UISwitch(
    relative_rect=pygame.Rect((20, 300), (180, 30)),
    starting_state=True,
    manager=ui_manager
)
switch_glow = pygame_gui.elements.UISwitch(
    relative_rect=pygame.Rect((20, 340), (180, 30)),
    starting_state=True,
    manager=ui_manager
)

# 标签
pygame_gui.elements.UILabel(
    relative_rect=pygame.Rect((20, 50), (250, 30)),
    text="粒子数量:",
    manager=ui_manager
)
pygame_gui.elements.UILabel(
    relative_rect=pygame.Rect((20, 110), (250, 30)),
    text="重力强度:",
    manager=ui_manager
)
pygame_gui.elements.UILabel(
    relative_rect=pygame.Rect((20, 170), (250, 30)),
    text="爆炸半径:",
    manager=ui_manager
)
pygame_gui.elements.UILabel(
    relative_rect=pygame.Rect((20, 230), (250, 30)),
    text="星空背景:",
    manager=ui_manager
)
pygame_gui.elements.UILabel(
    relative_rect=pygame.Rect((20, 270), (250, 30)),
    text="粒子尾迹:",
    manager=ui_manager
)
pygame_gui.elements.UILabel(
    relative_rect=pygame.Rect((20, 310), (250, 30)),
    text="光晕效果:",
    manager=ui_manager
)

# 状态栏
status_bar = pygame_gui.elements.UITextBox(
    html_text="<font color='#aaffaa'>✅ 就绪 | 按 [G] 开始录制 GIF</font>",
    relative_rect=pygame.Rect((20, 400), (300, 60)),
    manager=ui_manager
)

# ==================== 核心类（保持原逻辑 100% 不变） ====================
class Particle:
    def __init__(self, x, y, color, gravity=0.1, radius_range=(1, 3)):
        self.x = x
        self.y = y
        self.color = color
        self.radius = random.randint(*radius_range)
        self.speed = random.uniform(2, 6)
        self.angle = random.uniform(0, 2 * math.pi)
        self.vx = math.cos(self.angle) * self.speed
        self.vy = math.sin(self.angle) * self.speed
        self.gravity = gravity
        self.life = 100
        self.alpha = 255

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vy += self.gravity
        self.life -= 1
        self.alpha = int(self.life * 2.55)

    def draw(self, surface):
        if self.life > 0:
            color_with_alpha = (
                min(255, self.color[0]),
                min(255, self.color[1]),
                min(255, self.color[2])
            )
            pygame.draw.circle(
                surface,
                color_with_alpha,
                (int(self.x), int(self.y)),
                self.radius
            )
            pygame.draw.circle(
                surface,
                (color_with_alpha[0]//2, color_with_alpha[1]//2, color_with_alpha[2]//2),
                (int(self.x), int(self.y)),
                self.radius + 2,
                1
            )

    def is_dead(self):
        return self.life <= 0

class Firework:
    def __init__(self, gravity=0.1):
        self.x = random.randint(100, WIDTH - 100)
        self.y = HEIGHT
        self.color = random.choice(COLORS)
        self.speed = random.uniform(5, 8)
        self.particles = []
        self.exploded = False
        self.target_y = random.randint(50, HEIGHT // 2)
        self.gravity = gravity

    def update(self):
        if not self.exploded:
            self.y -= self.speed
            pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), 2)
            if self.y <= self.target_y:
                self.explode()
        else:
            for particle in self.particles[:]:
                particle.update()
                if particle.is_dead():
                    self.particles.remove(particle)

    def explode(self):
        self.exploded = True
        particle_count = int(slider_particle_count.get_current_value())
        for _ in range(particle_count):
            self.particles.append(Particle(self.x, self.y, self.color, self.gravity))

    def draw(self):
        if not self.exploded:
            pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), 4)
            if switch_trails.get_state():
                for i in range(5):
                    pygame.draw.circle(
                        screen,
                        self.color,
                        (int(self.x), int(self.y) + i * 3),
                        2 - i * 0.3
                    )
        else:
            for particle in self.particles:
                particle.draw(screen)

    def is_done(self):
        return self.exploded and len(self.particles) == 0

# ==================== GIF 录制系统 ====================
gif_frames = []
gif_recording = False
gif_start_time = 0
def capture_frame():
    global gif_frames
    # 截取当前屏幕为 PIL 图像
    str_format = 'RGB'
    raw_str = pygame.image.tostring(screen, str_format, False)
    pil_image = Image.frombytes(str_format, (WIDTH, HEIGHT), raw_str)
    gif_frames.append(pil_image.copy())

def export_gif():
    global gif_frames
    if len(gif_frames) < 5:
        return
    # 生成唯一文件名
    timestamp = pygame.time.get_ticks()
    filename = f"fireworks_demo_{timestamp}.gif"
    try:
        gif_frames[0].save(
            os.path.join("uploads", filename),
            save_all=True,
            append_images=gif_frames[1:],
            duration=1000//GIF_FRAME_RATE,
            loop=0
        )
        status_bar.html_text = f"<font color='#aaffaa'>✅ GIF 已导出: {filename}</font>"
        status_bar.rebuild()
        print(f"[INFO] GIF saved to uploads/{filename}")
    except Exception as e:
        status_bar.html_text = f"<font color='#ffaaaa'>❌ 导出失败: {str(e)}</font>"
        status_bar.rebuild()
    finally:
        gif_frames.clear()

# ==================== 主循环 ====================
def main():
    global gif_recording, gif_start_time, gif_frames
    fireworks = []
    running = True
    font = pygame.font.SysFont(None, 24)

    # 添加初始烟花
    for _ in range(3):
        fireworks.append(Firework(gravity=slider_gravity.get_current_value()))

    while running:
        time_delta = clock.tick(FPS) / 1000.0

        # 处理事件
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    for _ in range(3):
                        fireworks.append(Firework(gravity=slider_gravity.get_current_value()))
                elif event.key == pygame.K_g or event.key == pygame.K_G:
                    # 切换 GIF 录制
                    if not gif_recording:
                        gif_recording = True
                        gif_start_time = pygame.time.get_ticks()
                        gif_frames.clear()
                        status_bar.html_text = "<font color='#ffff77'>⏺️ 正在录制 GIF... 按 G 停止</font>"
                        status_bar.rebuild()
                    else:
                        gif_recording = False
                        export_gif()
                elif event.key == pygame.K_r or event.key == pygame.K_R:
                    # 重置参数
                    slider_particle_count.set_current_value(120)
                    slider_gravity.set_current_value(0.1)
                    slider_explosion_radius.set_current_value(120)
                    switch_stars.set_state(True)
                    switch_trails.set_state(True)
                    switch_glow.set_state(True)
                    status_bar.html_text = "<font color='#aaffaa'>🔄 参数已重置</font>"
                    status_bar.rebuild()
            elif event.type == pygame.MOUSEBUTTONDOWN:
                fireworks.append(Firework(gravity=slider_gravity.get_current_value()))
            
            ui_manager.process_events(event)

        # 更新 UI
        ui_manager.update(time_delta)

        # 填充背景
        screen.fill(BLACK)

        # 绘制星空（受开关控制）
        if switch_stars.get_state():
            for _ in range(5):
                if random.random() < 0.1:
                    x = random.randint(0, WIDTH)
                    y = random.randint(0, HEIGHT // 3)
                    size = random.randint(1, 3)
                    brightness = random.randint(150, 255)
                    pygame.draw.circle(screen, (brightness, brightness, brightness), (x, y), size)

        # 更新和绘制烟花
        for firework in fireworks[:]:
            firework.update()
            firework.draw()
            if firework.is_done():
                fireworks.remove(firework)

        # 随机添加新烟花（受上限控制）
        if random.random() < 0.03 and len(fireworks) < MAX_FIREWORKS:
            fireworks.append(Firework(gravity=slider_gravity.get_current_value()))

        # 录制帧（如果启用）
        if gif_recording:
            current_time = pygame.time.get_ticks()
            elapsed = (current_time - gif_start_time) / 1000.0
            if elapsed >= GIF_DURATION_SEC:
                gif_recording = False
                export_gif()
            else:
                capture_frame()

        # 绘制 UI
        ui_manager.draw_ui(screen)

        # 绘制标题
        screen.blit(title_text, (20, 10))

        # 绘制状态信息
        fps_text = font.render(f"FPS: {int(clock.get_fps())}", True, (180, 180, 180))
        fireworks_text = font.render(f"烟花数: {len(fireworks)}", True, (180, 180, 180))
        screen.blit(fps_text, (WIDTH - 120, 10))
        screen.blit(fireworks_text, (WIDTH - 120, 40))

        # 绘制快捷键提示
        hints = [
            "[G] 录制 GIF | [R] 重置参数 | [ESC] 退出",
            "[SPACE] 组发 | [CLICK] 单发",
        ]
        for i, h in enumerate(hints):
            hint_surf = font.render(h, True, (150, 150, 255))
            screen.blit(hint_surf, (20, HEIGHT - 60 + i*25))

        pygame.display.flip()

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
