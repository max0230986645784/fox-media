# =============================================================================
#  NoxOS - build system
# -----------------------------------------------------------------------------
#  make            -> build/noxos.img (image disque bootable)
#  make run        -> lance QEMU avec affichage graphique
#  make run-serial -> QEMU sans fenetre, console sur le terminal (Ctrl+A puis X pour quitter)
#  make test       -> tests automatiques dans QEMU (tests/run_tests.sh)
#  make clean
# =============================================================================

ARCH      := x86
BUILD     := build
BOOT_DIR  := boot
KERNEL_DIR:= kernel

AS        := nasm
CC        := gcc
LD        := ld
OBJCOPY   := objcopy
QEMU      := qemu-system-i386

CFLAGS    := -m32 -std=gnu11 -ffreestanding -fno-pie -fno-stack-protector \
             -fno-builtin -nostdlib -nostdinc -O2 -Wall -Wextra -Werror \
             -mno-sse -mno-mmx -mno-80387 -mgeneral-regs-only \
             -D__KERNEL__ -I$(KERNEL_DIR)/include
HOSTCC    := gcc
LDFLAGS   := -m elf_i386 -T $(KERNEL_DIR)/linker.ld -nostdlib
ASFLAGS32 := -f elf32

STAGE2_SECTORS := 4

# --- Sources kernel -----------------------------------------------------------
# entry.o doit etre le premier objet lie : c'est l'adresse 0x10000.
KERNEL_ASM := $(KERNEL_DIR)/arch/$(ARCH)/entry.asm \
              $(KERNEL_DIR)/arch/$(ARCH)/gdt_flush.asm \
              $(KERNEL_DIR)/arch/$(ARCH)/idt_flush.asm \
              $(KERNEL_DIR)/arch/$(ARCH)/isr.asm \
              $(KERNEL_DIR)/arch/$(ARCH)/switch.asm
KERNEL_C   := $(wildcard $(KERNEL_DIR)/core/*.c) \
              $(wildcard $(KERNEL_DIR)/arch/$(ARCH)/*.c) \
              $(wildcard $(KERNEL_DIR)/drivers/*.c) \
              $(wildcard $(KERNEL_DIR)/mm/*.c) \
              $(wildcard $(KERNEL_DIR)/proc/*.c) \
              $(wildcard $(KERNEL_DIR)/fs/*.c) \
              $(wildcard $(KERNEL_DIR)/lib/*.c)

KERNEL_OBJ := $(patsubst %.asm,$(BUILD)/%.o,$(KERNEL_ASM)) \
              $(patsubst %.c,$(BUILD)/%.o,$(KERNEL_C))

IMAGE      := $(BUILD)/noxos.img
KERNEL_ELF := $(BUILD)/kernel.elf
KERNEL_BIN := $(BUILD)/kernel.bin
STAGE1_BIN := $(BUILD)/stage1.bin
STAGE2_BIN := $(BUILD)/stage2.bin
MKNOXFS    := $(BUILD)/mknoxfs
ROOTFS_SRC := rootfs
ROOTFS     := $(BUILD)/rootfs
FS_IMAGE   := $(BUILD)/noxfs.img
FS_BLOCKS  := 1024                     # 4 Mo
BOOT_AREA  := 1048576                  # 1 Mo reserve avant NoxFS (LBA 2048)

.PHONY: all run run-serial test clean size

all: $(IMAGE)

# --- Kernel -------------------------------------------------------------------
$(BUILD)/%.o: %.asm
	@mkdir -p $(dir $@)
	$(AS) $(ASFLAGS32) $< -o $@

$(BUILD)/%.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c $< -o $@

$(KERNEL_ELF): $(KERNEL_OBJ) $(KERNEL_DIR)/linker.ld
	$(LD) $(LDFLAGS) -o $@ $(KERNEL_OBJ)

$(KERNEL_BIN): $(KERNEL_ELF)
	$(OBJCOPY) -O binary $< $@

# --- Bootloader ---------------------------------------------------------------
$(STAGE1_BIN): $(BOOT_DIR)/stage1.asm
	@mkdir -p $(BUILD)
	$(AS) -f bin -DSTAGE2_SECTORS=$(STAGE2_SECTORS) $< -o $@

# Le stage 2 doit connaitre la taille du kernel (en secteurs de 512 octets).
$(STAGE2_BIN): $(BOOT_DIR)/stage2.asm $(KERNEL_BIN)
	$(AS) -f bin -DSTAGE2_SECTORS=$(STAGE2_SECTORS) \
	      -DKERNEL_SECTORS=$$(( ($$(stat -c %s $(KERNEL_BIN)) + 511) / 512 )) \
	      $< -o $@

# --- NoxFS : outil hote + image construite depuis rootfs/ --------------------
$(MKNOXFS): tools/mknoxfs.c $(KERNEL_DIR)/include/nox/noxfs.h
	@mkdir -p $(BUILD)
	$(HOSTCC) -O2 -Wall -Wextra -Werror -o $@ $<

$(FS_IMAGE): $(MKNOXFS) $(shell find $(ROOTFS_SRC) -type f)
	rm -rf $(ROOTFS) && mkdir -p $(ROOTFS)
	cp -r $(ROOTFS_SRC)/. $(ROOTFS)/
	$(MKNOXFS) $@ $(FS_BLOCKS) $(ROOTFS) NoxOS

# --- Image disque : [stage1][stage2][kernel] ... 1 Mo ... [NoxFS] -------------
$(IMAGE): $(STAGE1_BIN) $(STAGE2_BIN) $(KERNEL_BIN) $(FS_IMAGE)
	cat $(STAGE1_BIN) $(STAGE2_BIN) $(KERNEL_BIN) > $@
	truncate -s $(BOOT_AREA) $@
	cat $(FS_IMAGE) >> $@
	@echo "==> $(IMAGE) ready ($$(stat -c %s $(KERNEL_BIN)) bytes of kernel)"

size: $(KERNEL_ELF)
	size $(KERNEL_ELF)

# --- QEMU ---------------------------------------------------------------------
QEMU_FLAGS := -drive file=$(IMAGE),format=raw,if=ide -m 64M -no-reboot

run: $(IMAGE)
	$(QEMU) $(QEMU_FLAGS) -serial stdio

run-serial: $(IMAGE)
	$(QEMU) $(QEMU_FLAGS) -display none -serial mon:stdio

test: $(IMAGE)
	./tests/run_tests.sh

clean:
	rm -rf $(BUILD)
