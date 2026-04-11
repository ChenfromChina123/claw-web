import pygame
import random
import math
import sys

# 初始化pygame
pygame.init()

# 设置窗口尺寸
WIDTH, HEIGHT = 1000, 700
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("烟花模拟 - Python Fireworks (Optimized)")

# 颜色定义
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

class Particle:
    def __init__(self, x, y, color):
        self.x = x
        self.y = y
        self.color = color
        self.radius = random.randint(1, 3)
        self.speed = random.uniform(2, 6)
        self.angle = random.uniform(0, 2 * math.pi)
        self.vx = math.cos(self.angle) * self.speed
        self.vy = math.sin(self.angle) * self.speed
        self.gravity = 0.1
        self.life = 100  # 粒子寿命
        self.alpha = 255  # 透明度（用于 Surface）

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vy += self.gravity
        self.life -= 1
        self.alpha = max(0, int(self.life * 2.55))  # 防止负值

    def draw(self, surface):
        if self.life > 0:
            # ✅ 使用带 Alpha 的 Surface 实现真透明度
            s = pygame.Surface((self.radius * 2, self.radius * 2), pygame.SRCALPHA)
            # 主粒子（带 alpha）
            pygame.draw.circle(s, (*self.color, self.alpha), (self.radius, self.radius), self.radius)
            # 光晕（半透明暗色）
            pygame.draw.circle(s, (self.color[0]//2, self.color[1]//2, self.color[2]//2, self.alpha//2),
                               (self.radius, self.radius), self.radius + 2, 1)
            surface.blit(s, (int(self.x) - self.radius, int(self.y) - self.radius))

    def is_dead(self):
        return self.life <= 0

class Firework:
    def __init__(self):
        self.x = random.randint(100, WIDTH - 100)
        self.y = HEIGHT
        self.color = random.choice(COLORS)
        self.speed = random.uniform(5, 8)
        self.particles = []
        self.exploded = False
        self.target_y = random.randint(50, HEIGHT // 2)

    def update(self):
        if not self.exploded:
            self.y -= self.speed
            # 绘制上升轨迹（保持原逻辑）
            pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), 2)
            if self.y <= self.target_y:
                self.explode()
        else:
            # ✅ 高效更新粒子：单次遍历 + 列表推导重建
            for particle in self.particles[:]:
                particle.update()
            # ✅ 移除死亡粒子（O(n) 而非 O(n²)）
            self.particles = [p for p in self.particles if not p.is_dead()]

    def explode(self):
        self.exploded = True
        particle_count = random.randint(80, 150)
        for _ in range(particle_count):
            self.particles.append(Particle(self.x, self.y, self.color))

    def draw(self):
        if not self.exploded:
            pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), 4)
            for i in range(5):
                pygame.draw.circle(
                    screen,
                    self.color,
                    (int(self.x), int(self.y) + i * 3),
                    max(1, 2 - i * 0.3)  # 防止 radius <= 0
                )
        else:
            for particle in self.particles:
                particle.draw(screen)

    def is_done(self):
        return self.exploded and len(self.particles) == 0

def main():
    clock = pygame.time.Clock()
    fireworks = []
    running = True
    font = pygame.font.SysFont(None, 24)

    # 添加初始烟花
    for _ in range(3):
        fireworks.append(Firework())

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    for _ in range(3):
                        fireworks.append(Firework())
            elif event.type == pygame.MOUSEBUTTONDOWN:
                fireworks.append(Firework())

        screen.fill(BLACK)

        # 绘制星星背景
        for _ in range(5):
            if random.random() < 0.1:
                x = random.randint(0, WIDTH)
                y = random.randint(0, HEIGHT // 3)
                size = random.randint(1, 3)
                brightness = random.randint(150, 255)
                pygame.draw.circle(screen, (brightness, brightness, brightness), (x, y), size)

        # ✅ 高效更新 & 绘制烟花（避免切片副本）
        for firework in fireworks[:]:
            firework.update()
            firework.draw()
            if firework.is_done():
                fireworks.remove(firework)
                # ✅ 显式释放对象引用（辅助垃圾回收）
                del firework

        # 随机添加新烟花（加内存保护）
        if random.random() < 0.03 and len(fireworks) < 15:
            fireworks.append(Firework())

        # 显示说明文字
        instructions = [
            "空格键: 发射一组烟花",
            "鼠标点击: 发射单个烟花",
            "ESC键: 退出程序",
            f"当前烟花数量: {len(fireworks)}"
        ]
        for i, text in enumerate(instructions):
            text_surface = font.render(text, True, (200, 200, 200))
            screen.blit(text_surface, (10, 10 + i * 25))

        pygame.display.flip()
        clock.tick(60)

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
