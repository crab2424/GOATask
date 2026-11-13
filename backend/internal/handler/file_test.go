package handler

import (
	"bytes"
	"mime/multipart"
	"testing"
)

func TestValidateUploadedFile(t *testing.T) {
	cases := []struct {
		name    string
		body    []byte
		wantErr bool
	}{
		{"a.json", []byte(`{"a":1}`), false},
		{"a.zip", []byte("PK\x03\x04aaaaaaaaaaaa"), false},
		{"a.heic", append([]byte{0, 0, 0, 0x18}, []byte("ftypheic\x00\x00\x00\x00mif1heic")...), false},
		{"a.xls", []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0}, false},
		{"a.wav", []byte("RIFF\x00\x00\x00\x00WAVEfmt "), false},
		{"a.gz", []byte{0x1f, 0x8b, 0x08, 0, 0, 0}, false},
		{"a.pdf", []byte("%PDF-1.4 abc"), false},
		{"Makefile", []byte("all:\n"), false},
		// 危険な拡張子は拒否
		{"a.exe", []byte("MZ"), true},
		{"a.sh", []byte("#!/bin/sh\n"), true},
		// 拡張子と中身の食い違いは拒否
		{"a.pdf", []byte("PK\x03\x04aaaaaaaaaaaa"), true},
		{"a.png", []byte("%PDF-1.4 abc"), true},
	}
	for _, c := range cases {
		err := validateUploadedFile(&multipart.FileHeader{Filename: c.name}, bytes.NewReader(c.body))
		if (err != nil) != c.wantErr {
			t.Errorf("%s: err=%v, wantErr=%v", c.name, err, c.wantErr)
		}
	}
}
