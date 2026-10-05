/* NoxOS - pilote framebuffer lineaire (voir include/nox/fb.h) */
#include <nox/fb.h>
#include <nox/memory.h>
#include <nox/pmm.h>

static struct surface screen;
static bool active;
static uintptr_t phys_base;
static u32 byte_size;

bool fb_init(const struct boot_info *info)
{
    active = false;
    if (!info || !info->fb_addr || info->fb_bpp != 32 ||
        info->fb_width == 0 || info->fb_height == 0 || (info->fb_pitch & 3))
        return false;
    phys_base = info->fb_addr;
    screen.pixels = (u32 *)info->fb_addr;
    screen.w = (int)info->fb_width;
    screen.h = (int)info->fb_height;
    screen.pitch = (int)(info->fb_pitch / 4);
    byte_size = PAGE_ALIGN_UP(info->fb_pitch * info->fb_height);
    active = true;
    return true;
}

bool fb_active(void)            { return active; }
uintptr_t fb_phys(void)         { return phys_base; }
u32  fb_size(void)              { return byte_size; }
struct surface *fb_surface(void){ return active ? &screen : NULL; }
int  fb_width(void)             { return screen.w; }
int  fb_height(void)            { return screen.h; }
