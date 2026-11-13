package handler

import "testing"

func TestSyncDescriptionCheckboxMarker(t *testing.T) {
	cases := []struct {
		name        string
		desc        string
		position    int
		text        string
		done        bool
		want        string
		wantChanged bool
	}{
		{"チェックを付ける", "memo\n- [ ] a\n- [ ] b", 1, "b", true, "memo\n- [ ] a\n- [x] b", true},
		{"チェックを外す", "- [x] a", 0, "a", false, "- [ ] a", true},
		{"字下げを保つ", "memo\n  - [ ] child\n- [X] big", 0, "child", true, "memo\n  - [x] child\n- [X] big", true},
		{"タブの字下げを保つ", "\t- [ ] child", 0, "child", true, "\t- [x] child", true},
		{"マーカーのない行は触らない", "・a\n- b", 0, "a", true, "・a\n- b", false},
		{"本文が一致しなければ触らない", "- [ ] a", 0, "other", true, "- [ ] a", false},
		{"既に同じ状態なら変更なし", "- [x] a", 0, "a", true, "- [x] a", false},
	}
	for _, c := range cases {
		got, changed := syncDescriptionCheckboxMarker(c.desc, c.position, c.text, c.done)
		if got != c.want || changed != c.wantChanged {
			t.Errorf("%s: got (%q, %v), want (%q, %v)", c.name, got, changed, c.want, c.wantChanged)
		}
	}
}
