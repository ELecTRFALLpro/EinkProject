package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"eink-server/pkg/response"

	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	uploadDir string
}

func NewUploadHandler(uploadDir string) *UploadHandler {
	_ = os.MkdirAll(uploadDir, 0755)
	return &UploadHandler{uploadDir: uploadDir}
}

// UploadImage 处理用户上传的照片原图或作品渲染图
func (h *UploadHandler) UploadImage(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.BadRequest(c, "NO_FILE", "未找到上传的文件")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".jpg"
	}
	// 允许常见的图片格式
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" && ext != ".bin" {
		response.BadRequest(c, "INVALID_FORMAT", "仅支持 JPG, PNG, WEBP, BIN 格式")
		return
	}

	// 限制大小（最大 25MB）
	if header.Size > 25*1024*1024 {
		response.BadRequest(c, "FILE_TOO_LARGE", "图片体积不能超过 25MB")
		return
	}

	// 生成安全随机文件名
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	randSuffix := hex.EncodeToString(b)
	filename := fmt.Sprintf("img_%d_%s%s", time.Now().Unix(), randSuffix, ext)
	dstPath := filepath.Join(h.uploadDir, filename)

	out, err := os.Create(dstPath)
	if err != nil {
		response.InternalError(c, "保存文件失败: "+err.Error())
		return
	}
	defer out.Close()

	if _, err = io.Copy(out, file); err != nil {
		response.InternalError(c, "写入文件失败: "+err.Error())
		return
	}

	url := "/uploads/" + filename
	response.OK(c, gin.H{
		"url":      url,
		"filename": filename,
		"size":     header.Size,
		"ext":      ext,
	})
}
